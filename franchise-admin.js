/* FIELDZERO V15 - central franchise and advertising controls. */
(() => {
  'use strict';
  const cfg=window.FIELDZERO_CONFIG||{};
  const ready=!!(window.supabase&&cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&!String(cfg.SUPABASE_URL).includes('YOUR-PROJECT')&&!String(cfg.SUPABASE_ANON_KEY).includes('YOUR_SUPABASE'));
  const db=ready?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>`LKR ${Number(v||0).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const msg=(el,text,kind='')=>{if(el){el.textContent=text;el.className=`form-status${kind?` ${kind}`:''}`;}};
  let central=false, user=null, fields=[], mainField=null;

  async function checkCentral() {
    if(!db)return false;
    const session=await db.auth.getSession();user=session.data.session?.user||null;
    if(!user)return false;
    const access=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
    return !access.error&&!!access.data;
  }
  async function initialise() {
    if(!db){msg($('#franchiseNetworkStatus'),'Supabase config.js is not ready.','error');return;}
    central=await checkCentral();
    if(!central){
      if($('#franchiseNetworkStatus'))msg($('#franchiseNetworkStatus'),'Sign in to the central FIELDZERO admin account to use network controls. Field owners must use field-admin.html.','error');
      return;
    }
    await refreshAll();
  }
  async function refreshAll(){
    if(!central)return;
    await Promise.all([loadFields(),loadRequests(),loadFieldEvents(),loadCommissions(),loadAds(),loadPerformance()]);
  }
  async function loadFields(){
    const result=await db.from('arena_fields').select('id,name,address,slug,is_main,active,network_status,owner_name,owner_email,owner_mobile,commission_rate,booking_deposit_percent').order('is_main',{ascending:false}).order('name');
    if(result.error){$('#franchiseFieldsAdmin').innerHTML=`<p class="admin-error">${esc(result.error.message)}</p>`;return;}
    fields=result.data||[];mainField=fields.find(x=>x.is_main)||null;
    const select=$('#fzAdFieldSelect');
    if(select){const prev=select.value;select.innerHTML='<option value="">All FIELDZERO locations</option>'+fields.filter(x=>x.active).map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');if(fields.some(f=>f.id===prev))select.value=prev;}
    const active=fields.filter(f=>f.active&&f.network_status==='active').length;
    $('#franchiseNetworkKpis').innerHTML=[['Registered fields',fields.length],['Active locations',active],['Franchise locations',fields.filter(f=>!f.is_main).length],['Main location','Imbulgoda']].map(([a,b])=>`<article class="field-kpi"><small>${esc(a)}</small><strong>${esc(b)}</strong></article>`).join('');
    $('#franchiseFieldsAdmin').innerHTML=fields.map(f=>{
      const portal=`field-admin.html?field=${encodeURIComponent(f.slug||'')}`;
      const isOn=f.active&&f.network_status==='active';
      return `<article class="field-record-card"><div class="field-record-main"><span class="field-record-kicker">${f.is_main?'MAIN FIELD':'FRANCHISE FIELD'} · ${isOn?'ACTIVE':'SUSPENDED'}</span><h4>${esc(f.name)}</h4><p>${esc(f.address||'Address not set')}</p><small>Owner: ${esc(f.owner_name||'FIELDZERO central')} · ${esc(f.owner_email||'No owner assigned')} · Commission ${Number(f.commission_rate||0)}% · Booking advance ${Number(f.booking_deposit_percent||30)}%</small><small>Field admin: ${esc(portal)}</small></div><div class="field-record-actions"><a class="button button-ghost" target="_blank" rel="noopener" href="${esc(portal)}">OPEN PORTAL ↗</a><button class="button button-ghost" data-field-deposit="${esc(f.id)}" data-deposit="${Number(f.booking_deposit_percent||30)}">SET ADVANCE %</button>${!f.is_main?`<button class="button button-ghost" data-field-rate="${esc(f.id)}" data-rate="${Number(f.commission_rate||10)}">SET COMMISSION</button><button class="button ${isOn?'button-danger':'button-lime'}" data-field-active="${esc(f.id)}" data-next="${!isOn}">${isOn?'SUSPEND FIELD':'REACTIVATE'}</button>`:''}</div></article>`;
    }).join('')||'<div class="empty-state">No fields are registered.</div>';
    $('#franchiseFieldsAdmin').querySelectorAll('[data-field-active]').forEach(btn=>btn.addEventListener('click',async()=>{
      const activate=btn.dataset.next==='true';
      if(!confirm(`${activate?'Reactivate':'Suspend'} ${fields.find(f=>f.id===btn.dataset.fieldActive)?.name}? Historical records will remain.`))return;
      const {error}=await db.rpc('fz_admin_set_field_status',{p_field_id:btn.dataset.fieldActive,p_active:activate,p_note:''});
      if(error){alert(error.message);return;}await loadFields();
    }));
    $('#franchiseFieldsAdmin').querySelectorAll('[data-field-deposit]').forEach(btn=>btn.addEventListener('click',async()=>{const f=fields.find(x=>x.id===btn.dataset.fieldDeposit);const raw=prompt(`Default advance percentage for ${f?.name||'this field'} (1–100):`,btn.dataset.deposit);if(raw===null)return;const rate=Number(raw);if(!Number.isFinite(rate)||rate<1||rate>100){alert('Enter a percentage from 1 to 100.');return;}const {error}=await db.rpc('fz_admin_set_booking_deposit_percent',{p_field_id:btn.dataset.fieldDeposit,p_percent:rate});if(error){alert(error.message);return;}await loadFields();}));
    $('#franchiseFieldsAdmin').querySelectorAll('[data-field-rate]').forEach(btn=>btn.addEventListener('click',async()=>{
      const old=Number(btn.dataset.rate),raw=prompt('Enter franchise commission percentage (default 10):',String(old));if(raw===null)return;
      const rate=Number(raw);if(!Number.isFinite(rate)||rate<0||rate>100){alert('Enter a percentage from 0 to 100.');return;}
      const {error}=await db.from('arena_fields').update({commission_rate:rate}).eq('id',btn.dataset.fieldRate).eq('is_main',false);
      if(error){alert(error.message);return;}await loadFields();await loadCommissions();
    }));
  }
  async function loadPerformance(){
    const host=$('#franchisePerformanceAdmin');if(!host)return;
    const {data,error}=await db.from('fz_central_field_performance').select('field_id,name,is_main,active,commission_rate,gross_collections,commission_due,commission_settled,payment_count').order('is_main',{ascending:false}).order('name');
    if(error){host.innerHTML=`<p class="admin-error">${esc(error.message)} · Check the V15 network reporting view.</p>`;return;}
    host.innerHTML=(data||[]).map(r=>`<article class="field-record-card compact"><div class="field-record-main"><span class="field-record-kicker">${r.is_main?'MAIN FIELD':'FRANCHISE LOCATION'} · ${r.active?'ACTIVE':'SUSPENDED'} · ${Number(r.commission_rate||0)}% COMMISSION</span><h4>${esc(r.name)}</h4><p>Collections recorded <b>${money(r.gross_collections)}</b> · Transactions ${Number(r.payment_count||0)}</p><small>Commission due ${money(r.commission_due)} · Settled ${money(r.commission_settled)}</small></div></article>`).join('')||'<div class="empty-state">No field performance is available yet.</div>';
  }
  async function loadRequests(){
    const result=await db.from('fz_franchise_field_requests').select('*').order('created_at',{ascending:false}).limit(100);
    if(result.error){$('#franchiseRequestsAdmin').innerHTML=`<p class="admin-error">${esc(result.error.message)}</p>`;return;}
    const rows=result.data||[];
    $('#franchiseRequestsAdmin').innerHTML=rows.map(r=>`<article class="field-record-card"><div class="field-record-main"><span class="field-record-kicker">${esc(r.status.toUpperCase())} · ${new Date(r.created_at).toLocaleDateString()}</span><h4>${esc(r.field_name)}</h4><p>${esc(r.owner_name)} · ${esc(r.owner_email)} · ${esc(r.owner_mobile)}</p><small>${esc(r.address)}</small>${r.google_maps_url?`<p><a href="${esc(r.google_maps_url)}" target="_blank" rel="noopener">OPEN SITE MAP ↗</a></p>`:''}${r.proposal?`<p>${esc(r.proposal)}</p>`:''}</div><div class="field-record-actions">${r.status==='pending'?`<button class="button button-lime" data-request-action="approve" data-id="${esc(r.id)}">APPROVE FIELD</button><button class="button button-danger" data-request-action="reject" data-id="${esc(r.id)}">REJECT</button>`:''}</div></article>`).join('')||'<div class="empty-state">No field partner applications have been submitted.</div>';
    $('#franchiseRequestsAdmin').querySelectorAll('[data-request-action]').forEach(btn=>btn.addEventListener('click',async()=>{
      const id=btn.dataset.id;
      if(btn.dataset.requestAction==='approve'){
        if(!confirm('Approve this franchise field? The owner must already have verified the email and created their password. A new field workspace and separate accounts will be created.'))return;
        const {data,error}=await db.rpc('fz_admin_approve_field_request',{p_request_id:id});
        if(error){alert(error.message);return;}
        alert(`Field created. Field ID: ${data}. The owner can sign in at field-admin.html using the approved email and password.`);
      }else{
        const note=prompt('Optional reason to keep in the application record:','');if(note===null)return;
        const {error}=await db.rpc('fz_admin_reject_field_request',{p_request_id:id,p_note:note});if(error){alert(error.message);return;}
      }
      await Promise.all([loadRequests(),loadFields()]);
    }));
  }
  async function loadFieldEvents(){
    let q=db.from('events').select('id,title,event_type,event_date,field_id,publication_status,arena_fields(name)').eq('publication_status','pending_review');const filter=$('#franchiseEventsFieldFilter')?.value||'all';if(filter!=='all')q=q.eq('field_id',filter);const result=await q.order('event_date');
    if(result.error){$('#franchiseEventsAdmin').innerHTML=`<p class="admin-error">${esc(result.error.message)}</p>`;return;}
    const rows=result.data||[];
    $('#franchiseEventsAdmin').innerHTML=rows.map(r=>`<article class="field-record-card"><div class="field-record-main"><span class="field-record-kicker">PENDING CENTRAL REVIEW</span><h4>${esc(r.title)}</h4><p>${esc(r.event_type)} · ${esc(r.event_date||'Date TBA')} · ${esc(r.arena_fields?.name||'Field not assigned')}</p></div><div class="field-record-actions"><button class="button button-lime" data-event-review="publish" data-id="${esc(r.id)}">PUBLISH</button><button class="button button-danger" data-event-review="reject" data-id="${esc(r.id)}">REJECT</button></div></article>`).join('')||'<div class="empty-state">No field events are awaiting publication.</div>';
    $('#franchiseEventsAdmin').querySelectorAll('[data-event-review]').forEach(btn=>btn.addEventListener('click',async()=>{
      if(!confirm(`${btn.dataset.eventReview==='publish'?'Publish':'Reject'} this field event?`))return;
      const {error}=await db.rpc('fz_admin_review_field_event',{p_event_id:btn.dataset.id,p_decision:btn.dataset.eventReview,p_note:''});
      if(error){alert(error.message);return;}await loadFieldEvents();
    }));
  }
  async function loadCommissions(){
    let q=db.from('fz_franchise_commissions').select('id,field_id,payment_id,cashbook_entry_id,gross_amount,commission_rate,commission_amount,status,settled_date,settlement_reference,created_at,arena_fields(name)').order('created_at',{ascending:false}).limit(250);const filter=$('#franchiseCommissionFieldFilter')?.value||'all';if(filter!=='all')q=q.eq('field_id',filter);const result=await q;
    if(result.error){$('#franchiseCommissionAdmin').innerHTML=`<p class="admin-error">${esc(result.error.message)}</p>`;return;}
    const rows=result.data||[];
    const due=rows.filter(x=>x.status==='due').reduce((s,x)=>s+Number(x.commission_amount||0),0);
    const paid=rows.filter(x=>x.status==='settled').reduce((s,x)=>s+Number(x.commission_amount||0),0);
    const kpis=$('#franchiseNetworkKpis');
    if(kpis){const base=fields.length; kpis.querySelectorAll('[data-commission-kpi]').forEach(x=>x.remove());kpis.insertAdjacentHTML('beforeend',`<article class="field-kpi" data-commission-kpi><small>Commission outstanding</small><strong>${esc(money(due))}</strong></article><article class="field-kpi" data-commission-kpi><small>Commission settled</small><strong>${esc(money(paid))}</strong></article>`);}
    $('#franchiseCommissionAdmin').innerHTML=rows.map(x=>`<article class="field-record-card compact"><div class="field-record-main"><span class="field-record-kicker">${esc(x.status.toUpperCase())} · ${esc(x.created_at?.slice(0,10)||'')}</span><h4>${esc(x.arena_fields?.name||fields.find(f=>f.id===x.field_id)?.name||'Franchise field')}</h4><p>Gross received ${money(x.gross_amount)} · Commission ${Number(x.commission_rate)}% · <b>${money(x.commission_amount)}</b></p><small>${x.payment_id?'Invoice payment':'Cashbook income'} ref: ${esc(x.payment_id||x.cashbook_entry_id||'—')}</small>${x.settlement_reference?`<small>Settlement: ${esc(x.settlement_reference)}</small>`:''}</div><div class="field-record-actions">${x.status==='due'?`<button class="button button-lime" data-commission-settle="${esc(x.id)}">MARK RECEIVED</button>`:''}</div></article>`).join('')||'<div class="empty-state">No franchise customer payments have been recorded yet.</div>';
    $('#franchiseCommissionAdmin').querySelectorAll('[data-commission-settle]').forEach(btn=>btn.addEventListener('click',async()=>{
      const ref=prompt('Enter the bank transfer / settlement reference. Only mark this as received after the transfer reaches FIELDZERO.','');if(ref===null)return;
      if(!ref.trim()){alert('A settlement reference is required.');return;}
      const {error}=await db.from('fz_franchise_commissions').update({status:'settled',settled_date:new Date().toISOString().slice(0,10),settlement_reference:ref.trim()}).eq('id',btn.dataset.commissionSettle).eq('status','due');
      if(error){alert(error.message);return;}await loadCommissions();
    }));
  }
  async function loadAds(){
    let q=db.from('fz_advertisements').select('id,field_id,advertiser_name,title,description,image_url,destination_url,placement,starts_at,ends_at,campaign_fee,payment_status,invoice_id,active,impressions,clicks,priority').order('created_at',{ascending:false}).limit(100);const filter=$('#fzAdsFieldFilter')?.value||'all';if(filter!=='all')q=q.eq('field_id',filter);const result=await q;
    if(result.error){$('#fzAdsAdminList').innerHTML=`<p class="admin-error">${esc(result.error.message)}</p>`;return;}
    const rows=result.data||[];
    $('#fzAdsAdminList').innerHTML=rows.map(a=>`<article class="field-record-card"><div class="field-record-main"><span class="field-record-kicker">${a.active?'ACTIVE':'PAUSED'} · ${esc(a.payment_status.toUpperCase())} · ${esc(a.placement)}</span><h4>${esc(a.title)}</h4><p>${esc(a.advertiser_name)} · ${money(a.campaign_fee)}</p><small>Impressions ${Number(a.impressions||0).toLocaleString()} · Clicks ${Number(a.clicks||0).toLocaleString()} · ${esc(fields.find(f=>f.id===a.field_id)?.name||'All fields')}</small>${a.invoice_id?`<small>Invoice: ${esc(a.invoice_id)}</small>`:''}</div><div class="field-record-actions">${Number(a.campaign_fee)>0&&!a.invoice_id&&a.payment_status==='unpaid'?`<button class="button button-lime" data-ad-invoice="${esc(a.id)}">CREATE INVOICE</button>`:''}<button class="button button-ghost" data-ad-toggle="${esc(a.id)}" data-active="${a.active}">${a.active?'PAUSE':'ACTIVATE'}</button></div></article>`).join('')||'<div class="empty-state">No sponsor campaigns are set up.</div>';
    $('#fzAdsAdminList').querySelectorAll('[data-ad-toggle]').forEach(btn=>btn.addEventListener('click',async()=>{
      const ad=rows.find(x=>x.id===btn.dataset.adToggle);if(!ad)return;
      if(ad.campaign_fee>0&&!['paid','comped'].includes(ad.payment_status)){alert('This placement stays hidden until its invoice is paid or it is marked complimentary.');return;}
      const {error}=await db.from('fz_advertisements').update({active:btn.dataset.active!=='true'}).eq('id',ad.id);
      if(error){alert(error.message);return;}await loadAds();
    }));
    $('#fzAdsAdminList').querySelectorAll('[data-ad-invoice]').forEach(btn=>btn.addEventListener('click',()=>createAdInvoice(rows.find(x=>x.id===btn.dataset.adInvoice))));
  }
  async function createAdInvoice(ad){
    if(!ad)return;
    const target=mainField;
    if(!target){alert('Set up Imbulgoda as the main field first.');return;}
    const payload={field_id:target.id,customer_name:ad.advertiser_name,customer_phone:'',customer_email:'',invoice_date:new Date().toISOString().slice(0,10),due_date:new Date().toISOString().slice(0,10),currency:'LKR',discount_amount:0,tax_rate:0,notes:`Website sponsorship campaign: ${ad.title}\nPlacement: ${ad.placement}\nCampaign ID: ${ad.id}`,terms:'Sponsor placement will be published after full invoice settlement.'};
    const items=[{description:`FIELDZERO website sponsor placement · ${ad.title}`,quantity:1,unit_price:Number(ad.campaign_fee)}];
    const {data,error}=await db.rpc('fz_admin_create_invoice',{p_invoice:payload,p_items:items});
    if(error){alert(error.message);return;}
    const update=await db.from('fz_advertisements').update({invoice_id:data,active:false}).eq('id',ad.id);
    if(update.error){alert(`Invoice ${data} created, but could not link it to the ad: ${update.error.message}`);return;}
    await loadAds();alert(`Sponsor invoice ${data} created. Record the advertiser's payment in the Finance workspace. The public ad will unlock after the invoice is fully paid.`);
  }
  $('#fzAdForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget,fd=new FormData(form);
    const fee=Number(fd.get('campaign_fee')||0),complimentary=fd.get('payment_status')==='comped';
    const image=String(fd.get('image_url')||'').trim(),dest=String(fd.get('destination_url')||'').trim();
    if(image&&!/^https:\/\//i.test(image)){msg($('#fzAdStatus'),'Image URL must begin with https://.','error');return;}
    if(dest&&!/^https:\/\//i.test(dest)){msg($('#fzAdStatus'),'Destination must begin with https://.','error');return;}
    if(fee>0&&complimentary){if(!confirm('This campaign has a fee but is marked complimentary. Continue without billing?'))return;}
    const paymentStatus=complimentary?'comped':fee>0?'unpaid':'comped';
    const payload={field_id:fd.get('field_id')||null,advertiser_name:String(fd.get('advertiser_name')||'').trim(),title:String(fd.get('title')||'').trim(),description:String(fd.get('description')||'').trim(),image_url:image,destination_url:dest,cta_label:String(fd.get('cta_label')||'LEARN MORE').trim(),placement:fd.get('placement'),campaign_fee:fee,payment_status:paymentStatus,priority:Number(fd.get('priority')||50),starts_at:fd.get('starts_at')?new Date(fd.get('starts_at')).toISOString():new Date().toISOString(),ends_at:fd.get('ends_at')?new Date(fd.get('ends_at')).toISOString():null,active:fd.get('active')==='on'&&(fee===0||paymentStatus==='comped')};
    const {data,error}=await db.from('fz_advertisements').insert(payload).select('id').single();
    if(error){msg($('#fzAdStatus'),error.message,'error');return;}
    form.reset();msg($('#fzAdStatus'),fee>0&&!complimentary?'Campaign saved as unpaid. Create the sponsor invoice from its card below.':'Campaign saved. It is eligible to publish when its date window is active.','success');await loadAds();
  });
  window.addEventListener('fz-franchise-events-filter',loadFieldEvents);
  window.addEventListener('fz-franchise-commission-filter',loadCommissions);
  window.addEventListener('fz-franchise-ads-filter',loadAds);
  $('#fzNetworkRefresh')?.addEventListener('click',refreshAll);
  $('#fzAdsRefresh')?.addEventListener('click',loadAds);
  if(db){
    db.auth.onAuthStateChange((_event,session)=>{if(!session?.user){central=false;return;}user=session.user;setTimeout(initialise,0);});
    initialise();
  }
})();
