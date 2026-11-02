/* FIELDZERO V15 - isolated field-owner portal.
   Every request is still checked by Supabase RLS/RPCs; URL slugs are not credentials. */
(() => {
  'use strict';
  const cfg = window.FIELDZERO_CONFIG || {};
  const configured = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !String(cfg.SUPABASE_URL).includes('YOUR-PROJECT') && !String(cfg.SUPABASE_ANON_KEY).includes('YOUR_SUPABASE'));
  const db = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = n => `LKR ${Number(n || 0).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo'}).format(new Date());
  const show = (el, message, kind='') => { if (el) { el.textContent = message; el.className = `form-status${kind ? ` ${kind}` : ''}`; } };
  const queryField = new URLSearchParams(location.search).get('field');
  let user = null, field = null, role = 'owner', bookings = [], accounts = [], invoices = [], cashbook = [], sessions = [], invoiceSettings = {};
  let selectedTab = 'overview';

  function selectTab(key) {
    selectedTab = key;
    document.querySelectorAll('[data-field-panel]').forEach(panel => { panel.hidden = panel.dataset.fieldPanel !== key; });
    document.querySelectorAll('[data-field-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.fieldTab === key));
  }
  document.querySelectorAll('[data-field-tab]').forEach(btn => btn.addEventListener('click', () => selectTab(btn.dataset.fieldTab)));

  async function ensureField(userInfo) {
    user = userInfo;
    const loginPanel = $('#fieldLoginPanel'), workspace = $('#fieldWorkspace');
    $('#fieldSignOut').hidden = !user;
    if (!user) { loginPanel.hidden = false; workspace.hidden = true; return; }
    const map = await db.from('fz_field_admins').select('field_id,role').eq('user_id', user.id).eq('active', true);
    if (map.error) { show($('#fieldLoginStatus'), `Could not verify field access: ${map.error.message}`, 'error'); return; }
    if (!map.data?.length) {
      loginPanel.hidden = false; workspace.hidden = true;
      show($('#fieldLoginStatus'), 'Your account is signed in, but no active field has been assigned yet. The central FIELDZERO team must approve your application first.', 'error');
      return;
    }
    const ids = map.data.map(x => x.field_id);
    const fields = await db.from('arena_fields').select('id,name,slug,address,is_main,commission_rate,network_status,active').in('id', ids);
    if (fields.error) { show($('#fieldLoginStatus'), `Could not load your field profile: ${fields.error.message}`, 'error'); return; }
    const available = (fields.data || []).filter(f => f.active && f.network_status === 'active');
    field = available.find(f => f.slug === queryField) || (!queryField && available.length === 1 ? available[0] : null);
    if (!field) {
      loginPanel.hidden = false; workspace.hidden = true;
      show($('#fieldLoginStatus'), queryField ? 'This account is not assigned to the field in this link, or that field is inactive.' : 'More than one field is assigned. Open the field-specific link supplied by FIELDZERO central.', 'error');
      return;
    }
    role = map.data.find(x => x.field_id === field.id)?.role || 'manager';
    loginPanel.hidden = true; workspace.hidden = false;
    $('#fieldNameHeading').textContent = field.name;
    $('#fieldMetaHeading').textContent = `${field.address || ''} · ${field.is_main ? 'MAIN FIELD' : 'FRANCHISE LOCATION'}`;
    $('#fieldRoleBadge').textContent = role.toUpperCase();
    $('#fieldCommissionText').textContent = field.is_main ? '0% network commission · main field' : `${Number(field.commission_rate || 10)}% network commission`;
    selectTab(selectedTab);
    await refreshWorkspace();
  }

  async function refreshWorkspace() {
    if (!field) return;
    await Promise.all([loadBookings(), loadFinance(), loadEvents(), loadCommunity(), loadOperations()]);
    renderOverview();
  }

  async function loadBookings() {
    const result = await db.from('arena_bookings').select('*').eq('field_id', field.id).order('booking_start',{ascending:false}).limit(200);
    if (result.error) { $('#fieldBookingsList').innerHTML = `<p class="admin-error">${esc(result.error.message)}</p>`; return; }
    bookings = result.data || [];
    renderBookings();
  }
  function renderBookings() {
    const host = $('#fieldBookingsList'); if (!host) return;
    const filter = $('#fieldBookingFilter')?.value || 'all';
    const q = ($('#fieldBookingSearch')?.value || '').toLowerCase().trim();
    const rows = bookings.filter(b => (filter === 'all' || b.status === filter) && (!q || [b.booking_reference,b.callsign,b.mobile,b.real_name].some(v => String(v || '').toLowerCase().includes(q))));
    host.innerHTML = rows.length ? rows.map(b => {
      const when = new Date(b.booking_start).toLocaleString('en-GB',{timeZone:'Asia/Colombo',dateStyle:'medium',timeStyle:'short'});
      const special = b.special_request || b.booking_kind === 'special';
      return `<article class="field-record-card"><div class="field-record-main"><span class="field-record-kicker">${special ? 'SPECIAL REQUEST' : 'STANDARD BOOKING'} · ${esc(b.status.toUpperCase())}</span><h4>${esc(b.booking_reference || 'LEGACY BOOKING')} · ${esc(b.callsign)}</h4><p>${esc(b.real_name)} · ${esc(b.mobile)} · ${Number(b.player_count || 1)} player(s)</p><small>${esc(when)} · ${esc(b.experience || 'Field session')}</small>${b.notes ? `<p>${esc(b.notes)}</p>` : ''}</div><div class="field-record-actions">${b.status === 'pending' ? `<button class="button button-lime" data-booking-action="approve" data-id="${esc(b.id)}">APPROVE</button><button class="button button-ghost" data-booking-action="reject" data-id="${esc(b.id)}">DECLINE</button>` : ''}${b.status === 'approved' ? `<button class="button button-ghost" data-booking-invoice="${esc(b.id)}">CREATE INVOICE</button>` : ''}<button class="button button-ghost" data-booking-pass="${esc(b.id)}">BOOKING PASS PDF</button></div></article>`;
    }).join('') : '<div class="empty-state">No bookings match this view.</div>';
    host.querySelectorAll('[data-booking-action]').forEach(btn => btn.addEventListener('click', async () => {
      const decision = btn.dataset.bookingAction;
      if (!confirm(`${decision === 'approve' ? 'Approve' : 'Decline'} this booking?`)) return;
      const { error } = await db.rpc('fz_admin_review_special_booking',{p_booking_id:btn.dataset.id,p_decision:decision,p_message:''});
      if (error) { alert(error.message); return; }
      await loadBookings(); renderOverview();
    }));
    host.querySelectorAll('[data-booking-pass]').forEach(btn => btn.addEventListener('click', () => makeBookingPass(bookings.find(b => b.id === btn.dataset.bookingPass))));
    host.querySelectorAll('[data-booking-invoice]').forEach(btn => btn.addEventListener('click', () => createInvoiceFromBooking(bookings.find(b => b.id === btn.dataset.bookingInvoice))));
  }

  function makeBookingPass(b) {
    if (!b || !window.jspdf?.jsPDF) return;
    const {jsPDF}=window.jspdf, doc=new jsPDF({unit:'mm',format:'a4'});
    doc.setFillColor(17,23,16); doc.rect(0,0,210,70,'F'); doc.setTextColor(185,255,64); doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.text('FIELDZERO',15,25);
    doc.setTextColor(255,255,255); doc.setFontSize(23); doc.text('BOOKING PASS',15,51);
    doc.setTextColor(20,30,20); doc.setFontSize(17); doc.text(String(b.booking_reference || 'LEGACY BOOKING'),15,91);
    const rows=[['CUSTOMER',`${b.real_name} / ${b.callsign}`],['MOBILE',b.mobile],['FIELD',field.name],['DATE & TIME',new Date(b.booking_start).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})],['PLAYERS',String(b.player_count)],['EXPERIENCE',b.experience || 'Field session'],['STATUS',b.status.toUpperCase()]];
    rows.forEach((r,i)=>{ const y=113+i*19; doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text(r[0],15,y);doc.setFont('helvetica','normal');doc.setFontSize(11);doc.text(String(r[1]||''),70,y); });
    doc.setFontSize(8);doc.text('Present this booking reference at the field check-in. This is not an invoice or payment receipt.',15,271,{maxWidth:180});
    doc.save(`${b.booking_reference || 'FIELDZERO-BOOKING'}.pdf`);
  }

  async function createInvoiceFromBooking(b) {
    if (!b || b.status !== 'approved') { alert('Only confirmed bookings can be invoiced.'); return; }
    const value = prompt(`Enter the agreed invoice amount in LKR for ${b.booking_reference || b.callsign}:`, String(Number(b.quoted_amount || 0)));
    if (value === null) return;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) { alert('Enter an amount greater than zero.'); return; }
    const customer = b.real_name || b.callsign;
    const payload = { field_id:field.id, customer_name:customer, customer_phone:b.mobile || '', customer_email:b.customer_email || '', invoice_date:today(), due_date:today(), currency:'LKR', discount_amount:0, tax_rate:0, notes:`Booking reference: ${b.booking_reference || b.id}\nField: ${field.name}`, terms:'Please retain the payment receipt.' };
    const items = [{description:`${b.experience || 'Field booking'} · ${b.booking_reference || ''} · ${b.player_count} player(s)`,quantity:1,unit_price:amount}];
    const {data,error}=await db.rpc('fz_admin_create_invoice',{p_invoice:payload,p_items:items});
    if(error){alert(`Invoice could not be created: ${error.message}`);return;}
    await loadFinance();
    await downloadInvoice(data);
    selectTab('finance');
  }

  async function loadFinance() {
    const [a,i,c,p,settings] = await Promise.all([
      db.from('fz_financial_accounts').select('id,account_name,account_type,active,opening_balance').eq('field_id',field.id).order('account_name'),
      db.from('fz_invoices').select('id,invoice_number,invoice_date,customer_name,customer_phone,customer_email,currency,status,total_amount,amount_paid,balance_due').eq('field_id',field.id).order('invoice_date',{ascending:false}).limit(60),
      db.from('fz_cashbook').select('id,entry_date,entry_type,category,description,amount,payment_method,reference,account_id,invoice_id').eq('field_id',field.id).order('entry_date',{ascending:false}).limit(100),
      db.from('fz_invoice_payments').select('id,receipt_number,invoice_id,payment_date,amount,payment_method,reference').eq('field_id',field.id).order('payment_date',{ascending:false}).limit(80),
      db.from('fz_field_invoice_settings').select('*').eq('field_id',field.id).maybeSingle()
    ]);
    accounts=a.data||[]; invoices=i.data||[]; cashbook=c.data||[]; const payments=p.data||[]; invoiceSettings=settings.data||{};
    const settingsForm=$('#fieldInvoiceSettingsForm');
    if(settingsForm){['business_name','legal_name','address','phone','email','registration_number','tax_registration_number','payment_instructions','invoice_footer'].forEach(k=>{if(settingsForm.elements.namedItem(k))settingsForm.elements.namedItem(k).value=invoiceSettings[k]||'';});}
    const month=today().slice(0,7);
    const invoicePaidThisMonth=payments.filter(x=>String(x.payment_date||'').slice(0,7)===month).reduce((sum,x)=>sum+Number(x.amount||0),0);
    const otherIncomeThisMonth=cashbook.filter(x=>x.entry_type==='income'&&!x.invoice_id&&String(x.entry_date||'').slice(0,7)===month).reduce((sum,x)=>sum+Number(x.amount||0),0);
    const paidThisMonth=invoicePaidThisMonth+otherIncomeThisMonth;
    const expensesThisMonth=cashbook.filter(x=>x.entry_type==='expense'&&String(x.entry_date||'').slice(0,7)===month).reduce((sum,x)=>sum+Number(x.amount||0),0);
    const due=invoices.reduce((sum,x)=>sum+Number(x.balance_due||0),0);
    $('#fieldFinanceKpis').innerHTML=[['Income received this month',money(paidThisMonth)],['Expenses this month',money(expensesThisMonth)],['Cash result this month',money(paidThisMonth-expensesThisMonth)],['Outstanding invoices',money(due)],['Invoices issued',String(invoices.length)]].map(([a,b])=>`<article class="field-kpi"><small>${esc(a)}</small><strong>${esc(b)}</strong></article>`).join('');
    $('#fieldAccountsList').innerHTML=accounts.map(x=>`<div class="field-mini-row"><b>${esc(x.account_name)}</b><span>${esc(x.account_type)} · ${x.active?'ACTIVE':'INACTIVE'}</span></div>`).join('')||'<p>No accounts configured.</p>';
    ['#fieldCashAccount','#fieldMaintenanceAccount'].forEach(selector=>{const accountSelect=$(selector);if(accountSelect){const prev=accountSelect.value;accountSelect.innerHTML='<option value="">Choose account</option>'+accounts.filter(x=>x.active).map(x=>`<option value="${esc(x.id)}">${esc(x.account_name)}</option>`).join('');if(accounts.some(x=>x.id===prev))accountSelect.value=prev;}});
    $('#fieldInvoicesList').innerHTML=invoices.map(x=>`<article class="field-record-card compact"><div class="field-record-main"><b>${esc(x.invoice_number)} · ${esc(x.customer_name)}</b><small>${esc(x.invoice_date)} · ${esc(x.status.toUpperCase())}</small><p>Total ${money(x.total_amount)} · Paid ${money(x.amount_paid)} · Due ${money(x.balance_due)}</p></div><div class="field-record-actions"><button class="button button-ghost" data-invoice-pdf="${esc(x.id)}">PDF</button>${Number(x.balance_due)>0&&x.status!=='void'?`<button class="button button-lime" data-invoice-pay="${esc(x.id)}">RECORD PAYMENT</button>`:''}</div></article>`).join('')||'<div class="empty-state">No invoices yet. Create one from a confirmed booking.</div>';
    $('#fieldInvoicesList').querySelectorAll('[data-invoice-pdf]').forEach(btn=>btn.addEventListener('click',()=>downloadInvoice(btn.dataset.invoicePdf)));
    $('#fieldInvoicesList').querySelectorAll('[data-invoice-pay]').forEach(btn=>btn.addEventListener('click',()=>recordPayment(btn.dataset.invoicePay)));
    $('#fieldCashbookList').innerHTML=cashbook.slice(0,12).map(x=>`<div class="field-mini-row"><div><b>${esc(x.category)}</b><small>${esc(x.entry_date)} · ${esc(x.description)}</small></div><strong class="${x.entry_type==='expense'?'negative':''}">${x.entry_type==='expense'?'-':'+'}${money(x.amount)}</strong></div>`).join('')||'<p>No cashbook entries yet.</p>';
    $('#fieldCashbookForm').elements.entry_date.value=today();
  }

  async function downloadInvoice(invoiceId) {
    if(!window.jspdf?.jsPDF) return;
    const [i,items]=await Promise.all([
      db.from('fz_invoices').select('*').eq('id',invoiceId).single(),
      db.from('fz_invoice_items').select('description,quantity,unit_price,line_total').eq('invoice_id',invoiceId).order('line_number')
    ]);
    if(i.error||!i.data){alert(i.error?.message||'Invoice not found');return;}
    const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'}),inv=i.data;
    doc.setFillColor(17,23,16);doc.rect(0,0,210,52,'F');doc.setTextColor(185,255,64);doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('FIELDZERO',15,22);doc.setTextColor(255,255,255);doc.setFontSize(18);doc.text('INVOICE',15,40);
    doc.setTextColor(20,30,20);doc.setFontSize(11);doc.text(`Invoice: ${inv.invoice_number}`,15,68);doc.text(`Date: ${inv.invoice_date}`,15,76);doc.text(`Customer: ${inv.customer_name}`,15,88);doc.text(`Field: ${field.name}`,15,96);
    const issuer=[invoiceSettings.business_name||field.name,invoiceSettings.legal_name,invoiceSettings.address||field.address,invoiceSettings.phone,invoiceSettings.email,invoiceSettings.registration_number?`Reg: ${invoiceSettings.registration_number}`:''].filter(Boolean);
    doc.setFontSize(8);issuer.forEach((v,n)=>doc.text(String(v),115,68+n*5,{maxWidth:80,align:'right'}));
    let y=116;doc.setFont('helvetica','bold');doc.text('DESCRIPTION',15,y);doc.text('QTY',125,y);doc.text('UNIT',148,y);doc.text('TOTAL',190,y,{align:'right'});y+=9;doc.setFont('helvetica','normal');
    (items.data||[]).forEach(row=>{doc.text(doc.splitTextToSize(row.description,98),15,y);doc.text(String(row.quantity),125,y);doc.text(Number(row.unit_price).toFixed(2),148,y);doc.text(Number(row.line_total).toFixed(2),190,y,{align:'right'});y+=12;});
    y=Math.max(y+10,190);doc.setFont('helvetica','bold');doc.text(`TOTAL: ${money(inv.total_amount)}`,190,y,{align:'right'});doc.text(`PAID: ${money(inv.amount_paid)}`,190,y+9,{align:'right'});doc.text(`BALANCE: ${money(inv.balance_due)}`,190,y+18,{align:'right'});doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(String(invoiceSettings.payment_instructions||''),15,263,{maxWidth:180});doc.text(String(invoiceSettings.invoice_footer||'Please keep this invoice and request a receipt when payment is received.'),15,275,{maxWidth:180});
    doc.save(`${inv.invoice_number}.pdf`);
  }

  async function recordPayment(invoiceId) {
    const inv=invoices.find(x=>x.id===invoiceId);if(!inv)return;
    const amountText=prompt(`Amount received (maximum ${money(inv.balance_due)}):`,String(inv.balance_due));if(amountText===null)return;
    const amount=Number(amountText);if(!Number.isFinite(amount)||amount<=0||amount>Number(inv.balance_due)){alert('Enter a valid payment up to the outstanding balance.');return;}
    if(!accounts.some(x=>x.active)){alert('Create an active financial account first.');return;}
    const methods=['cash','bank','card','online','other'];const methodText=prompt('Payment method: cash, bank, card, online or other','cash');if(methodText===null)return;
    const method=methodText.trim().toLowerCase();if(!methods.includes(method)){alert('Unsupported payment method.');return;}
    const accountText=accounts.filter(x=>x.active).map((x,n)=>`${n+1}. ${x.account_name}`).join('\n');
    const choice=prompt(`Select receiving account by number:\n${accountText}`,'1');if(choice===null)return;
    const account=accounts.filter(x=>x.active)[Number(choice)-1];if(!account){alert('Invalid account selection.');return;}
    const reference=prompt('Bank / card reference (optional):','')||'';
    const {data,error}=await db.rpc('fz_admin_record_invoice_payment',{p_invoice_id:invoiceId,p_amount:amount,p_payment_date:today(),p_payment_method:method,p_account_id:account.id,p_reference:reference,p_received_by:user.email||'Field admin',p_request_key:crypto.randomUUID()});
    if(error){alert(`Payment not recorded: ${error.message}`);return;}
    await loadFinance();
    const payment=await db.from('fz_invoice_payments').select('receipt_number,amount,payment_date,payment_method').eq('id',data).single();
    if(payment.data&&window.jspdf?.jsPDF){const doc=new window.jspdf.jsPDF({unit:'mm',format:'a5'});doc.setFillColor(17,23,16);doc.rect(0,0,148,42,'F');doc.setTextColor(185,255,64);doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text('FIELDZERO',12,20);doc.setTextColor(255,255,255);doc.setFontSize(13);doc.text('PAYMENT RECEIPT',12,32);doc.setTextColor(20,30,20);doc.setFontSize(10);doc.text(`Receipt: ${payment.data.receipt_number}`,12,60);doc.text(`Invoice: ${inv.invoice_number}`,12,70);doc.text(`Received from: ${inv.customer_name}`,12,80);doc.text(`Amount: ${money(payment.data.amount)}`,12,90);doc.text(`Date: ${payment.data.payment_date}`,12,100);doc.text(`Method: ${payment.data.payment_method}`,12,110);doc.text(`Field: ${field.name}`,12,120);doc.setFontSize(8);doc.text(String(invoiceSettings.business_name||field.name),12,128);doc.text(String(invoiceSettings.invoice_footer||'Thank you. Please retain this receipt.'),12,137,{maxWidth:120});doc.save(`${payment.data.receipt_number}.pdf`);}
    alert(`Payment saved. ${payment.data?.receipt_number || ''} receipt downloaded.`);
  }

  $('#fieldCashbookForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const payload={field_id:field.id,entry_date:fd.get('entry_date'),entry_type:fd.get('entry_type'),category:String(fd.get('category')||'').trim(),description:String(fd.get('description')||'').trim(),amount:Number(fd.get('amount')),payment_method:fd.get('payment_method'),account_id:fd.get('account_id'),reference:String(fd.get('reference')||''),created_by:user.id};
    const {error}=await db.from('fz_cashbook').insert(payload);
    if(error){show($('#fieldCashbookStatus'),error.message,'error');return;}
    e.currentTarget.reset();$('#fieldCashbookForm').elements.entry_date.value=today();show($('#fieldCashbookStatus'),'Cashbook entry saved.','success');await loadFinance();renderOverview();
  });
  $('#fieldAccountForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const {error}=await db.from('fz_financial_accounts').insert({field_id:field.id,account_name:String(fd.get('account_name')||'').trim(),account_type:fd.get('account_type')});
    if(error){show($('#fieldAccountStatus'),error.message,'error');return;}
    e.currentTarget.reset();show($('#fieldAccountStatus'),'Account created.','success');await loadFinance();
  });

  async function loadEvents(){
    const result=await db.from('events').select('id,title,event_type,event_date,start_time,end_time,price_amount,publication_status,published').eq('field_id',field.id).order('event_date',{ascending:false}).limit(60);
    if(result.error){$('#fieldEventsList').innerHTML=`<p class="admin-error">${esc(result.error.message)}</p>`;return;}
    const rows=result.data||[];
    $('#fieldEventsList').innerHTML=rows.map(e=>`<article class="field-record-card"><div class="field-record-main"><span class="field-record-kicker">${esc(e.publication_status|| (e.published?'published':'draft'))}</span><h4>${esc(e.title)}</h4><small>${esc(e.event_type)} · ${esc(e.event_date||'Date TBA')} · ${money(e.price_amount)}</small></div></article>`).join('')||'<div class="empty-state">You have not submitted any events yet.</div>';
  }
  $('#fieldEventForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const payload={field_id:field.id,title:String(fd.get('title')||'').trim(),event_type:fd.get('event_type'),event_date:fd.get('event_date'),start_time:fd.get('start_time')||null,end_time:fd.get('end_time')||null,price_amount:Number(fd.get('price_amount')||0),price_currency:'LKR',registration_limit:fd.get('registration_limit')?Number(fd.get('registration_limit')):null,registration_deadline:fd.get('registration_deadline')?new Date(fd.get('registration_deadline')).toISOString():null,description:String(fd.get('description')||''),rules:String(fd.get('rules')||'')};
    const {data,error}=await db.rpc('fz_submit_field_event_for_approval',{p_event:payload});
    if(error){show($('#fieldEventStatus'),error.message,'error');return;}
    e.currentTarget.reset();show($('#fieldEventStatus'),`Event submitted (${String(data).slice(0,8).toUpperCase()}). It will appear publicly only after central approval.`,'success');await loadEvents();renderOverview();
  });
  $('#fieldReloadEvents')?.addEventListener('click',loadEvents);

  async function loadCommunity(){
    const [photos,spotlights,feedback]=await Promise.all([
      db.from('gallery_photos').select('id,title,session_name,image_url,storage_path,published,created_at').eq('field_id',field.id).order('created_at',{ascending:false}).limit(50),
      db.from('fz_spotlight_cards').select('id,title,subtitle,image_url,active,created_at').eq('field_id',field.id).order('created_at',{ascending:false}).limit(20),
      db.from('feedback').select('id,display_name,rating,comment,published,created_at').eq('field_id',field.id).order('created_at',{ascending:false}).limit(40)
    ]);
    const pRows=[...(photos.data||[]).map(x=>({...x,content_type:'gallery'})),...(spotlights.data||[]).map(x=>({...x,content_type:'spotlight',session_name:'SPOTLIGHT'}))];
    $('#fieldPhotosList').innerHTML=pRows.map(x=>`<article class="field-photo-card"><img src="${esc(x.image_url)}" alt="${esc(x.title)}" loading="lazy"><div><b>${esc(x.title)}</b><small>${esc(x.content_type)} · ${x.published===false||x.active===false?'HIDDEN':'PUBLISHED'}</small><button type="button" class="button button-ghost" data-photo-toggle="${esc(x.id)}" data-photo-kind="${esc(x.content_type)}" data-state="${x.published===false||x.active===false?'false':'true'}">${x.published===false||x.active===false?'PUBLISH':'HIDE'}</button></div></article>`).join('')||'<p>No photos yet.</p>';
    $('#fieldPhotosList').querySelectorAll('[data-photo-toggle]').forEach(btn=>btn.addEventListener('click',async()=>{
      const table=btn.dataset.photoKind==='spotlight'?'fz_spotlight_cards':'gallery_photos';
      const col=table==='fz_spotlight_cards'?'active':'published';
      const {error}=await db.from(table).update({[col]:btn.dataset.state!=='true'}).eq('id',btn.dataset.photoToggle).eq('field_id',field.id);
      if(error){alert(error.message);return;}await loadCommunity();
    }));
    $('#fieldFeedbackList').innerHTML=(feedback.data||[]).map(x=>`<article class="field-record-card compact"><div class="field-record-main"><b>${esc(x.display_name)}</b><span>${'★'.repeat(Number(x.rating||0))} · ${x.published?'PUBLISHED':'HIDDEN'}</span><p>${esc(x.comment)}</p><small>${new Date(x.created_at).toLocaleDateString()}</small></div><button class="button button-ghost" data-feedback-toggle="${esc(x.id)}" data-state="${x.published}">${x.published?'HIDE':'PUBLISH'}</button></article>`).join('')||'<p>No feedback for this field yet.</p>';
    $('#fieldFeedbackList').querySelectorAll('[data-feedback-toggle]').forEach(btn=>btn.addEventListener('click',async()=>{const {error}=await db.from('feedback').update({published:btn.dataset.state!=='true'}).eq('id',btn.dataset.feedbackToggle).eq('field_id',field.id);if(error)alert(error.message);else loadCommunity();}));
  }
  $('#fieldPhotoForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget,fd=new FormData(form),file=fd.get('photo');
    if(!(file instanceof File)||!file.size){show($('#fieldPhotoStatus'),'Choose a photo from your device.','error');return;}
    if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>8*1024*1024){show($('#fieldPhotoStatus'),'Use JPG, PNG, WEBP or GIF up to 8 MB.','error');return;}
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const path=`${field.id}/${crypto.randomUUID()}.${ext}`;
    const up=await db.storage.from('fieldzero-gallery').upload(path,file,{contentType:file.type,upsert:false});
    if(up.error){show($('#fieldPhotoStatus'),up.error.message,'error');return;}
    const imageUrl=db.storage.from('fieldzero-gallery').getPublicUrl(path).data.publicUrl;
    const title=String(fd.get('title')||'').trim(),subtitle=String(fd.get('subtitle')||'').trim();
    let saved;
    if(fd.get('photo_type')==='spotlight'){
      saved=await db.from('fz_spotlight_cards').insert({field_id:field.id,title,subtitle,card_type:'top_player',image_url:imageUrl,starts_at:new Date().toISOString(),active:true});
    }else{
      saved=await db.from('gallery_photos').insert({field_id:field.id,title,session_name:String(fd.get('session_name')||'FIELD MOMENT'),image_url:imageUrl,storage_path:path,popup_featured:false,published:true});
    }
    if(saved.error){await db.storage.from('fieldzero-gallery').remove([path]);show($('#fieldPhotoStatus'),`Photo uploaded but could not be published: ${saved.error.message}`,'error');return;}
    form.reset();show($('#fieldPhotoStatus'),'Photo uploaded and published.','success');await loadCommunity();
  });

  async function loadOperations(){
    const [s,e,m]=await Promise.all([
      db.from('fz_sessions').select('id,session_name,session_date,status').eq('field_id',field.id).order('session_date',{ascending:false}).limit(30),
      db.from('fz_equipment').select('id,asset_code,item_name,quantity,condition_status,availability_status').eq('field_id',field.id).order('asset_code').limit(80),
      db.from('fz_maintenance_logs').select('id,task_type,description,findings,action_taken,service_cost,performed_by,next_due_date,created_at,fz_equipment(asset_code,item_name)').eq('field_id',field.id).order('created_at',{ascending:false}).limit(20)
    ]);
    sessions=s.data||[];
    const assets=e.data||[];
    const equipmentSelect=$('#fieldMaintenanceEquipment');
    if(equipmentSelect){const prev=equipmentSelect.value;equipmentSelect.innerHTML='<option value="">General field / site work</option>'+assets.map(x=>`<option value="${esc(x.id)}">${esc(x.asset_code)} · ${esc(x.item_name)}</option>`).join('');if(assets.some(x=>x.id===prev))equipmentSelect.value=prev;}
    $('#fieldTodaySummary').innerHTML=`<div class="field-mini-row"><b>Upcoming internal sessions</b><span>${sessions.filter(x=>x.session_date>=today()&&x.status!=='cancelled').length}</span></div><div class="field-mini-row"><b>Equipment assets</b><span>${assets.length}</span></div>`;
    $('#fieldEquipmentList').innerHTML=assets.map(x=>`<div class="field-mini-row"><div><b>${esc(x.asset_code)} · ${esc(x.item_name)}</b><small>${esc(x.condition_status)} · ${esc(x.availability_status)}</small></div><span>×${x.quantity}</span></div>`).join('')||'<p>No equipment registered.</p>';
    $('#fieldMaintenanceList').innerHTML=(m.data||[]).map(x=>`<article class="field-record-card compact"><div class="field-record-main"><b>${esc((x.task_type||'other').replaceAll('_',' ').toUpperCase())} · ${esc(x.fz_equipment?.asset_code||'FIELD / SITE')}</b><small>${esc(x.created_at?.slice(0,10)||'')} · ${esc(x.performed_by||'')} · ${money(x.service_cost||0)}</small><p>${esc(x.description)}${x.findings?' · '+esc(x.findings):''}${x.action_taken?' · '+esc(x.action_taken):''}</p></div><span class="ops-status">Due ${esc(x.next_due_date||'—')}</span></article>`).join('')||'<div class="empty-state">No maintenance has been recorded.</div>';
  }
  $('#fieldSessionForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const payload={field_id:field.id,session_name:String(fd.get('session_name')||'').trim(),session_date:fd.get('session_date'),start_time:fd.get('start_time')||null,end_time:fd.get('end_time')||null,max_players:Number(fd.get('max_players')||10),status:fd.get('status'),session_notes:String(fd.get('session_notes')||''),created_by:user.id};
    const {error}=await db.from('fz_sessions').insert(payload);
    if(error){show($('#fieldSessionStatus'),error.message,'error');return;}e.currentTarget.reset();show($('#fieldSessionStatus'),'Session created.','success');await loadOperations();renderOverview();
  });
  $('#fieldEquipmentForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const payload={field_id:field.id,asset_code:String(fd.get('asset_code')||'').trim(),item_name:String(fd.get('item_name')||'').trim(),category:fd.get('category'),quantity:Number(fd.get('quantity')||1)};
    const {error}=await db.from('fz_equipment').insert(payload);
    if(error){show($('#fieldEquipmentStatus'),error.message,'error');return;}e.currentTarget.reset();show($('#fieldEquipmentStatus'),'Equipment asset added.','success');await loadOperations();
  });
  $('#fieldMaintenanceForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget,fd=new FormData(form),cost=Number(fd.get('service_cost')||0),costPaid=fd.get('cost_paid')==='on';
    if(!Number.isFinite(cost)||cost<0){show($('#fieldMaintenanceStatus'),'Enter a valid maintenance cost.','error');return;}
    if(costPaid&&cost<=0){show($('#fieldMaintenanceStatus'),'Enter the actual amount already paid.','error');return;}
    const account=accounts.find(x=>x.id===fd.get('cost_account_id')&&x.active);
    if(costPaid&&!account){show($('#fieldMaintenanceStatus'),'Choose an active account belonging to this field.','error');return;}
    const button=form.querySelector('button[type=submit]');button.disabled=true;
    const payload={field_id:field.id,equipment_id:fd.get('equipment_id')||null,task_type:fd.get('task_type'),description:String(fd.get('description')||'').trim(),findings:String(fd.get('findings')||''),action_taken:String(fd.get('action_taken')||''),service_cost:cost,performed_by:String(fd.get('performed_by')||'').trim(),next_due_date:fd.get('next_due_date')||null,created_by:user.id};
    const saved=await db.from('fz_maintenance_logs').insert(payload).select('id').single();
    if(saved.error){button.disabled=false;show($('#fieldMaintenanceStatus'),saved.error.message,'error');return;}
    let cashError=null;
    if(costPaid){const cash=await db.from('fz_cashbook').insert({field_id:field.id,entry_date:today(),entry_type:'expense',category:'Equipment / field maintenance',description:`${payload.description}${payload.action_taken?' - '+payload.action_taken:''}`,amount:cost,payment_method:fd.get('cost_payment_method'),account_id:account.id,vendor_name:payload.performed_by,reference:`Maintenance log ${saved.data.id}`,created_by:user.id});cashError=cash.error;}
    if(payload.equipment_id){await db.from('fz_equipment').update({last_service_date:today(),next_service_date:payload.next_due_date,updated_at:new Date().toISOString()}).eq('id',payload.equipment_id).eq('field_id',field.id);}
    button.disabled=false;form.reset();
    if(cashError)show($('#fieldMaintenanceStatus'),`Maintenance saved, but expense posting failed: ${cashError.message}. Enter the paid cost once in Finance and reference log ${saved.data.id}.`,'error');
    else show($('#fieldMaintenanceStatus'),costPaid?'Maintenance saved and paid expense posted to this field cashbook. Do not enter it again.':'Maintenance saved. Record the cost in Finance when it is paid.','success');
    await Promise.all([loadOperations(),loadFinance(),renderOverview()]);
  });
  $('#fieldIncidentForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const payload={field_id:field.id,incident_type:fd.get('incident_type'),severity:fd.get('severity'),reported_by:String(fd.get('reported_by')||'').trim(),summary:String(fd.get('summary')||'').trim(),immediate_response:String(fd.get('immediate_response')||''),follow_up:String(fd.get('follow_up')||''),created_by:user.id};
    const {error}=await db.from('fz_incidents').insert(payload);
    if(error){show($('#fieldIncidentStatus'),error.message,'error');return;}e.currentTarget.reset();show($('#fieldIncidentStatus'),'Incident record saved. Keep follow-up information factual and private.','success');
  });

  function renderOverview(){
    if(!field)return;
    const pending=bookings.filter(x=>x.status==='pending').length;
    const confirmed=bookings.filter(x=>x.status==='approved').length;
    const paid=cashbook.filter(x=>x.entry_type==='income'&&String(x.entry_date||'').slice(0,7)===today().slice(0,7)).reduce((s,x)=>s+Number(x.amount||0),0);
    const expense=cashbook.filter(x=>x.entry_type==='expense'&&String(x.entry_date||'').slice(0,7)===today().slice(0,7)).reduce((s,x)=>s+Number(x.amount||0),0);
    $('#fieldKpis').innerHTML=[['Pending decisions',pending],['Confirmed bookings',confirmed],['This month income',money(paid)],['This month expenses',money(expense)]].map(([a,b])=>`<article class="field-kpi"><small>${esc(a)}</small><strong>${esc(b)}</strong></article>`).join('');
    $('#fieldTodaySummary').innerHTML=`<div class="field-mini-row"><b>Special booking requests</b><strong>${pending} pending</strong></div><div class="field-mini-row"><b>Upcoming internal sessions</b><strong>${sessions.filter(x=>x.session_date>=today()&&x.status!=='cancelled').length}</strong></div><div class="field-mini-row"><b>Recent confirmed bookings</b><strong>${confirmed}</strong></div>`;
  }

  $('#fieldReloadBookings')?.addEventListener('click',loadBookings);
  $('#fieldBookingFilter')?.addEventListener('change',renderBookings);
  $('#fieldBookingSearch')?.addEventListener('input',renderBookings);
  $('#fieldReloadFinance')?.addEventListener('click',async()=>{await loadFinance();renderOverview();});
  $('#fieldReloadCommunity')?.addEventListener('click',loadCommunity);

  const loginForm=$('#fieldLoginForm');
  $('#fieldForgotPassword')?.addEventListener('click',async()=>{
    if(!db){show($('#fieldLoginStatus'),'Database configuration is missing.','error');return;}
    const email=String(loginForm?.elements.namedItem('email')?.value||'').trim();
    if(!email){show($('#fieldLoginStatus'),'Enter your account email above, then select Forgot password.','error');return;}
    const redirectTo=new URL('field-admin.html',window.location.href).href;
    const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo});
    show($('#fieldLoginStatus'),error?`Password reset could not be sent: ${error.message}`:'Password reset link sent if the email is registered. Check your inbox.',error?'error':'success');
  });
  $('#fieldInvoiceSettingsForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const payload={field_id:field.id};
    ['business_name','legal_name','address','phone','email','registration_number','tax_registration_number','payment_instructions','invoice_footer'].forEach(k=>payload[k]=String(fd.get(k)||'').trim());
    const {error}=await db.from('fz_field_invoice_settings').upsert(payload,{onConflict:'field_id'});
    if(error){show($('#fieldInvoiceSettingsStatus'),error.message,'error');return;}
    invoiceSettings=payload;show($('#fieldInvoiceSettingsStatus'),'Field invoice identity saved. New PDFs will use these details.','success');
  });
  loginForm?.addEventListener('submit',async e=>{
    e.preventDefault();if(!db){show($('#fieldLoginStatus'),'Database configuration is missing.','error');return;}
    const fd=new FormData(loginForm),button=$('#fieldLoginButton');button.disabled=true;
    const {data,error}=await db.auth.signInWithPassword({email:String(fd.get('email')).trim(),password:String(fd.get('password'))});button.disabled=false;
    if(error){show($('#fieldLoginStatus'),error.message,'error');return;}
    show($('#fieldLoginStatus'),'Signed in. Checking field access…','success');await ensureField(data.user);
  });
  $('#fieldSignOut')?.addEventListener('click',async()=>{await db.auth.signOut();field=null;user=null;$('#fieldWorkspace').hidden=true;$('#fieldLoginPanel').hidden=false;$('#fieldSignOut').hidden=true;show($('#fieldLoginStatus'),'You have signed out.','success');});

  if(!db){show($('#fieldLoginStatus'),'Add your Supabase project URL and anon key to config.js before using the field portal.','error');}
  else db.auth.getSession().then(({data})=>ensureField(data.session?.user||null));
})();
