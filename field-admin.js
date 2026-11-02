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
    const fields = await db.from('arena_fields').select('id,name,slug,address,is_main,commission_rate,booking_deposit_percent,network_status,active').in('id', ids);
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
      const payLabel = ({not_invoiced:'ADVANCE REQUESTED',awaiting_deposit:'AWAITING ADVANCE',partial_deposit:'PARTIAL ADVANCE',deposit_paid:'ADVANCE PAID',paid:'FULLY PAID',void:'VOID'})[b.payment_status] || 'PAYMENT CHECK';
      const invoice = invoices.find(x=>x.id===b.invoice_id);
      const moneyLine = invoice ? `Invoice ${money(invoice.total_amount)} · Received ${money(invoice.amount_paid)} · Balance ${money(invoice.balance_due)}` : `Advance required ${money(500)}`;
      const requestPdf = !b.advance_verified_at ? `<button class="button button-ghost" data-booking-request-pdf="${esc(b.id)}">ADVANCE REQUEST PDF</button>` : '';
      const advanceButton = ['pending_payment','approved'].includes(b.status) && !b.invoice_id ? `<button class="button button-lime" data-booking-advance="${esc(b.id)}">VERIFY LKR 500 & CONFIRM</button>` : '';
      const checkoutButton = b.status==='approved' && b.invoice_id ? `<button class="button button-lime" data-booking-checkout="${esc(b.id)}">${b.checkout_finalized_at?'EDIT FINAL BILL':'FINAL BILL / ADD EXTRAS'}</button>` : '';
      const paymentButton = b.status==='approved' && b.invoice_id && b.checkout_finalized_at && Number(invoice?.balance_due||0)>0 ? `<button class="button button-lime" data-invoice-pay="${esc(b.invoice_id)}">RECORD REMAINING PAYMENT</button>` : '';
      const invoiceButton = b.invoice_id ? `<button class="button button-ghost" data-invoice-pdf="${esc(b.invoice_id)}">${b.checkout_finalized_at?'FINAL INVOICE PDF':'ADVANCE INVOICE PDF'}</button>` : '';
      const whatsAppButton = b.status==='approved' && b.invoice_id && Number(invoice?.amount_paid||0)>=500 ? `<button class="button button-ghost" data-booking-whatsapp="${esc(b.id)}">SEND INVOICE VIA WHATSAPP</button>` : '';
      const passButton = b.status==='approved' ? `<button class="button button-ghost" data-booking-pass="${esc(b.id)}">CONFIRMED PASS PDF</button>` : '';
      return `<article class="field-record-card" data-field-booking-card="${esc(b.id)}"><div class="field-record-main"><span class="field-record-kicker">${special ? 'SPECIAL REQUEST' : 'STANDARD BOOKING'} · ${esc(b.status.toUpperCase())} · ${esc(payLabel)}</span><h4>${esc(b.booking_reference || 'LEGACY BOOKING')} · ${esc(b.callsign)}</h4><p>${esc(b.real_name)} · ${esc(b.mobile)} · ${Number(b.player_count || 1)} player(s)</p><small>${esc(when)} · ${esc(b.experience || 'Field session')}</small><p>${esc(moneyLine)}</p>${b.status==='pending_payment'&&b.booking_hold_expires_at?`<small>Temporary hold expires ${esc(new Date(b.booking_hold_expires_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'}))}</small>`:''}${b.status==='pending_payment'&&b.booking_hold_expires_at&&new Date(b.booking_hold_expires_at)<new Date()?'<small class="field-payment-warning">The 12-hour hold has expired. The slot will be checked again before accepting the advance.</small>':''}${b.status==='approved'&&!b.checkout_finalized_at&&b.invoice_id?'<small>Advance received. Prepare the final bill after the customer has played.</small>':''}${b.status==='approved'&&b.checkout_finalized_at&&Number(invoice?.balance_due||0)>0?`<small>Collect remaining ${money(invoice.balance_due)} at checkout.</small>`:''}${b.notes ? `<p>${esc(b.notes)}</p>` : ''}</div><div class="field-record-actions">${b.status==='pending'&&special ? `<button class="button button-lime" data-booking-action="approve" data-id="${esc(b.id)}">APPROVE & REQUEST LKR 500</button><button class="button button-ghost" data-booking-action="reject" data-id="${esc(b.id)}">DECLINE</button>` : ''}${requestPdf}${advanceButton}${checkoutButton}${paymentButton}${invoiceButton}${whatsAppButton}${passButton}</div><div id="fieldCheckout-${esc(b.id)}" class="field-checkout-mount"></div></article>`;
    }).join('') : '<div class="empty-state">No bookings match this view.</div>';
    host.querySelectorAll('[data-booking-action]').forEach(btn => btn.addEventListener('click', async () => {
      const decision = btn.dataset.bookingAction;
      if (!confirm(`${decision === 'approve' ? 'Approve' : 'Decline'} this booking request? ${decision==='approve'?'The customer will still need to pay LKR 500 before confirmation.':''}`)) return;
      const { error } = await db.rpc('fz_admin_review_special_booking',{p_booking_id:btn.dataset.id,p_decision:decision,p_message:''});
      if (error) { alert(error.message); return; }
      await loadBookings(); renderOverview();
    }));
    host.querySelectorAll('[data-booking-pass]').forEach(btn => btn.addEventListener('click', async () => { try { await makeBookingPass(bookings.find(b => b.id === btn.dataset.bookingPass)); } catch (error) { alert(error.message || 'Could not generate the booking pass.'); } }));
    host.querySelectorAll('[data-invoice-pay]').forEach(btn => btn.addEventListener('click', () => { selectTab('finance'); recordPayment(btn.dataset.invoicePay); }));
    host.querySelectorAll('[data-invoice-pdf]').forEach(btn => btn.addEventListener('click', async()=>{try{const b=bookings.find(x=>x.invoice_id===btn.dataset.invoicePdf);await downloadInvoice(btn.dataset.invoicePdf,{mode:b?.checkout_finalized_at?'final':'advance'});}catch(e){alert(e.message||'Could not create invoice PDF.');}}));
    host.querySelectorAll('[data-booking-request-pdf]').forEach(btn=>btn.addEventListener('click',()=>{const b=bookings.find(x=>x.id===btn.dataset.bookingRequestPdf);if(b)generateBookingRequestPdf(b);}));
    host.querySelectorAll('[data-booking-advance]').forEach(btn=>btn.addEventListener('click',()=>recordBookingAdvance(bookings.find(x=>x.id===btn.dataset.bookingAdvance))));
    host.querySelectorAll('[data-booking-checkout]').forEach(btn=>btn.addEventListener('click',()=>openFinalBillEditor(bookings.find(x=>x.id===btn.dataset.bookingCheckout))));
    host.querySelectorAll('[data-booking-whatsapp]').forEach(btn=>btn.addEventListener('click',()=>shareBookingInvoice(bookings.find(x=>x.id===btn.dataset.bookingWhatsapp))));
  }

  async function makeBookingPass(b) {
    if (!b || b.status !== 'approved') { alert('A confirmed booking pass is available only after the required advance has been received.'); return; }
    if (!window.jspdf?.jsPDF) throw new Error('PDF library could not load. Refresh the field admin portal and try again.');
    const invoiceResult = b.invoice_id
      ? await db.from('fz_invoices').select('total_amount,amount_paid,balance_due').eq('id',b.invoice_id).maybeSingle()
      : { data: null, error: null };
    if (invoiceResult.error) throw invoiceResult.error;
    const inv = invoiceResult.data || {};
    const {jsPDF}=window.jspdf, doc=new jsPDF({unit:'mm',format:'a4'});
    doc.setFillColor(17,23,16); doc.rect(0,0,210,70,'F'); doc.setTextColor(185,255,64); doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.text('FIELDZERO',15,25);
    doc.setTextColor(255,255,255); doc.setFontSize(23); doc.text('CONFIRMED BOOKING PASS',15,51);
    doc.setTextColor(20,30,20); doc.setFontSize(16); doc.text(String(b.booking_reference || 'LEGACY BOOKING'),15,91);
    const rows=[
      ['CUSTOMER',`${b.real_name} / ${b.callsign}`],['MOBILE',b.mobile],['FIELD',field.name],
      ['DATE & TIME',new Date(b.booking_start).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})],
      ['PLAYERS',String(b.player_count)],['EXPERIENCE',b.experience || 'Field session'],
      ['BOOKING TOTAL',money(inv.total_amount ?? b.quoted_amount ?? 0)],
      ['ADVANCE RECEIVED',money(inv.amount_paid || 0)],
      ['BALANCE AT CHECKOUT',b.checkout_finalized_at?money(inv.balance_due || 0):'FINAL BILL AT CHECKOUT'],['STATUS','CONFIRMED · ADVANCE RECEIVED']
    ];
    rows.forEach((r,i)=>{ const y=111+i*14; doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text(r[0],15,y);doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(String(r[1]||''),70,y); });
    doc.setFontSize(8);doc.text('Present this booking reference at field check-in. Any remaining balance is payable before the session. This pass is not a tax invoice or payment receipt.',15,266,{maxWidth:180});
    doc.save(`${b.booking_reference || 'FIELDZERO-BOOKING'}-CONFIRMED.pdf`);
  }

  function generateBookingRequestPdf(b) {
    if(!window.jspdf?.jsPDF){alert('PDF library could not load.');return;}
    const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4'}),dark=[15,22,17],lime=[185,255,64],muted=[101,113,101],light=[241,245,237];
    doc.setFillColor(...dark);doc.rect(0,0,210,58,'F');doc.setFillColor(...lime);doc.rect(0,0,4,58,'F');doc.setTextColor(...lime);doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('FIELDZERO',15,23);doc.setTextColor(255,255,255);doc.setFontSize(13);doc.text('ADVANCE PAYMENT REQUEST',196,21,{align:'right'});doc.setFontSize(7);doc.setTextColor(205,215,200);doc.text(String(b.booking_reference||''),196,30,{align:'right'});
    doc.setFillColor(...lime);doc.roundedRect(14,70,182,38,3,3,'F');doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(7);doc.text('ADVANCE REQUIRED TO SECURE THIS BOOKING',21,81);doc.setFontSize(24);doc.text('LKR 500.00',21,97);
    const fmt=d=>new Date(d).toLocaleString('en-GB',{timeZone:'Asia/Colombo',dateStyle:'medium',timeStyle:'short'});let y=127;
    [['BOOKING REFERENCE',b.booking_reference],['CUSTOMER',`${b.real_name} · ${b.callsign}`],['WHATSAPP',b.mobile],['FIELD',field.name],['DATE / TIME',fmt(b.booking_start)],['PLAYERS',String(b.player_count||1)],['BOOKING TYPE',b.special_request?'SPECIAL REQUEST':'STANDARD BOOKING']].forEach((r,i)=>{if(i%2===0){doc.setFillColor(...light);doc.roundedRect(14,y-6,182,12,1,1,'F');}doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(...muted);doc.text(r[0],19,y+1);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...dark);doc.text(String(r[1]||'—'),78,y+1);y+=15;});
    doc.setFillColor(...dark);doc.roundedRect(14,244,182,29,2,2,'F');doc.setTextColor(...lime);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('PAYMENT INSTRUCTIONS',20,254);doc.setTextColor(255,255,255);doc.setFont('helvetica','normal');doc.setFontSize(7);const instructions=(b.special_request&&b.status==='pending')?'SPECIAL REQUEST: Wait for the field admin to approve availability. The LKR 500 advance becomes due only after acceptance; payment instructions will be confirmed by the field.':(String(invoiceSettings.payment_instructions||'').trim()||'Payment instructions have not been published. Contact the field admin and quote this booking reference before paying.');doc.text(doc.splitTextToSize(instructions.slice(0,360),168).slice(0,3),20,263);if(invoiceSettings.phone){doc.setTextColor(...lime);doc.setFont('helvetica','bold');doc.setFontSize(6.3);doc.text(`FIELD CONTACT: ${String(invoiceSettings.phone).slice(0,32)}`,20,271);}doc.setTextColor(...muted);doc.setFontSize(6);doc.text('FIELDZERO · PAYMENT REQUEST · NOT A RECEIPT',14,286);doc.save(`${b.booking_reference||'FIELDZERO'}-ADVANCE-REQUEST.pdf`);
  }

  function fieldWhatsAppDigits(phone){let d=String(phone||'').replace(/\D/g,'');if(d.startsWith('0'))d='94'+d.slice(1);return d;}
  function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  async function sharePdfWhatsApp(phone,message,pdf,popup){
    if(!pdf?.blob)throw new Error('Could not prepare the PDF.');
    const file=new File([pdf.blob],pdf.filename,{type:'application/pdf'});
    if(navigator.canShare?.({files:[file]})&&navigator.share){try{await navigator.share({files:[file],title:'FIELDZERO invoice',text:message});if(popup&&!popup.closed)popup.close();return 'shared';}catch(e){if(e?.name==='AbortError'){if(popup&&!popup.closed)popup.close();return 'cancelled';}}}
    downloadBlob(pdf.blob,pdf.filename);const digits=fieldWhatsAppDigits(phone);if(!digits||digits.length<8){if(popup&&!popup.closed)popup.close();throw new Error('The customer WhatsApp number is not valid. The PDF has been downloaded.');}
    const url=`https://wa.me/${digits}?text=${encodeURIComponent(message+'\n\nPlease attach the downloaded PDF before sending.')}`;if(popup&&!popup.closed)popup.location.href=url;else window.open(url,'_blank','noopener');return 'opened';
  }

  async function recordBookingAdvance(b){
    if(!b)return;const popup=window.open('about:blank','_blank');
    const activeAccounts=accounts.filter(a=>a.active);
    if(!activeAccounts.length){if(popup&&!popup.closed)popup.close();alert('Create an active receiving account in Finance before recording the advance.');return;}
    if(!confirm(`Confirm that you have actually received LKR 500 from ${b.real_name} for ${b.booking_reference}? The booking will be confirmed only after the transaction succeeds.`)){if(popup&&!popup.closed)popup.close();return;}
    const methodText=prompt('Payment method: cash, bank, card, online or other','cash');if(methodText===null){if(popup&&!popup.closed)popup.close();return;}const method=methodText.trim().toLowerCase();if(!['cash','bank','card','online','other'].includes(method)){if(popup&&!popup.closed)popup.close();alert('Choose cash, bank, card, online or other.');return;}
    const list=activeAccounts.map((a,i)=>`${i+1}. ${a.account_name}`).join('\n');const choice=prompt(`Where was the LKR 500 received?\n${list}`,'1');if(choice===null){if(popup&&!popup.closed)popup.close();return;}const account=activeAccounts[Number(choice)-1];if(!account){if(popup&&!popup.closed)popup.close();alert('Choose a valid receiving account.');return;}
    const reference=prompt('Bank / card transaction reference (optional):','')||'';const receivedBy=prompt('Received / verified by:',user.email||'')||'';
    const {data,error}=await db.rpc('fz_admin_record_booking_advance',{p_booking_id:b.id,p_payment_method:method,p_account_id:account.id,p_reference:reference,p_payment_date:today(),p_received_by:receivedBy});
    if(error){if(popup&&!popup.closed)popup.close();alert(error.message);return;}const result=Array.isArray(data)?data[0]:data;
    await Promise.all([loadFinance(),loadBookings()]);const fresh=bookings.find(x=>x.id===b.id)||{...b,status:'approved',advance_verified_at:new Date().toISOString()};
    const pdf=await downloadInvoice(result.invoice_id,{mode:'advance',paymentId:result.payment_id,download:false});await makeBookingPass({...fresh,status:'approved',invoice_id:result.invoice_id});
    const message=`FIELDZERO booking ${b.booking_reference} is CONFIRMED. We have received and verified your LKR 500 advance. Your advance paid invoice is attached. Please show your booking reference at check-in.`;
    try{const share=await sharePdfWhatsApp(b.mobile,message,pdf,popup);show($('#fieldInvoiceSettingsStatus'),share==='shared'?'Advance invoice shared from your device.':share==='cancelled'?'Sharing was cancelled. The booking remains confirmed; you can send the invoice from Finance.':'Advance invoice downloaded and WhatsApp opened. Attach the PDF and send.','success');}
    catch(e){if(popup&&!popup.closed)popup.close();alert(`Booking confirmed and advance invoice created, but WhatsApp could not be opened: ${e.message}`);}
    await Promise.all([loadBookings(),loadFinance()]);
  }

  async function shareBookingInvoice(b){
    if(!b?.invoice_id)return;const popup=window.open('about:blank','_blank');
    try{const inv=invoices.find(x=>x.id===b.invoice_id);if(Number(inv?.amount_paid||0)<500)throw new Error('Record the LKR 500 advance before sharing an advance invoice.');const mode=b.checkout_finalized_at?'final':'advance';const pdf=await downloadInvoice(b.invoice_id,{mode,download:false});const message=b.checkout_finalized_at?`FIELDZERO final invoice ${inv.invoice_number} for booking ${b.booking_reference}. Please find the final itemised bill attached.`:`FIELDZERO booking ${b.booking_reference} is confirmed. Your LKR 500 advance has been received. Please find the advance paid invoice attached.`;const result=await sharePdfWhatsApp(b.mobile,message,pdf,popup);if(result==='cancelled')show($('#fieldInvoiceSettingsStatus'),'Sharing cancelled. You can try again from the booking.','');else show($('#fieldInvoiceSettingsStatus'),result==='shared'?'Invoice shared using your device share sheet.':'Invoice downloaded and WhatsApp opened. Attach the downloaded PDF before sending.','success');}
    catch(e){if(popup&&!popup.closed)popup.close();alert(e.message||'Could not share invoice.');}
  }

  async function openFinalBillEditor(b){
    if(!b?.invoice_id||b.status!=='approved'){alert('Only a confirmed booking with an advance invoice can be checked out.');return;}
    const mount=$(`#fieldCheckout-${CSS.escape(b.id)}`);if(!mount)return;
    const {data,error}=await db.from('fz_invoice_items').select('description,quantity,unit_price').eq('invoice_id',b.invoice_id).order('line_number');if(error){alert(error.message);return;}
    let rows=(data||[]).filter(x=>!String(x.description||'').toLowerCase().includes('booking advance / reservation deposit'));
    if(!rows.length)rows=[{description:b.experience||'Field session / package',quantity:1,unit_price:0}];
    const rowHTML=(r={description:'Additional item',quantity:1,unit_price:0})=>`<div class="fz-checkout-row"><input data-checkout-description maxlength="180" aria-label="Item description" value="${esc(r.description)}" placeholder="Session fee / extra item"><input data-checkout-quantity type="number" min="0.01" step="0.01" aria-label="Quantity" value="${Number(r.quantity||1)}"><input data-checkout-price type="number" min="0" step="0.01" aria-label="Unit price in LKR" value="${Number(r.unit_price||0)}"><button type="button" class="button button-danger" data-checkout-remove>REMOVE</button></div>`;
    mount.innerHTML=`<section class="fz-checkout-editor"><div class="fz-checkout-title"><div><b>FINAL CHECKOUT BILL</b><small>Add the agreed session price and anything purchased at the field — rentals, drinks, merchandise or other extras. The LKR 500 advance stays credited.</small></div><button type="button" class="button button-ghost" data-checkout-close>CLOSE</button></div><div class="fz-checkout-head"><span>DESCRIPTION</span><span>QTY</span><span>UNIT PRICE (LKR)</span><span></span></div><div data-checkout-rows>${rows.map(rowHTML).join('')}</div><div class="fz-checkout-controls"><button type="button" class="button button-ghost" data-checkout-add>+ ADD ITEM</button><label>DISCOUNT (LKR)<input data-checkout-discount type="number" min="0" step="0.01" value="0"></label><label>TAX (%)<input data-checkout-tax type="number" min="0" max="100" step="0.01" value="0"></label></div><div class="fz-checkout-footer"><span>Final total must be at least the advance already received.</span><button type="button" class="button button-lime" data-checkout-save>SAVE FINAL BILL</button></div><div class="form-status" data-checkout-status role="status"></div></section>`;
    const rowsHost=mount.querySelector('[data-checkout-rows]');
    mount.querySelector('[data-checkout-add]').addEventListener('click',()=>rowsHost.insertAdjacentHTML('beforeend',rowHTML()));
    rowsHost.addEventListener('click',e=>{if(e.target.closest('[data-checkout-remove]')){const all=rowsHost.querySelectorAll('.fz-checkout-row');if(all.length>1)e.target.closest('.fz-checkout-row').remove();}});
    mount.querySelector('[data-checkout-close]').addEventListener('click',()=>mount.innerHTML='');
    mount.querySelector('[data-checkout-save]').addEventListener('click',async()=>{
      const items=[...rowsHost.querySelectorAll('.fz-checkout-row')].map(row=>({description:row.querySelector('[data-checkout-description]').value.trim(),quantity:Number(row.querySelector('[data-checkout-quantity]').value),unit_price:Number(row.querySelector('[data-checkout-price]').value)}));
      const status=mount.querySelector('[data-checkout-status]');if(!items.length||items.some(x=>x.description.length<2||!Number.isFinite(x.quantity)||x.quantity<=0||!Number.isFinite(x.unit_price)||x.unit_price<0)){show(status,'Complete each description, quantity and price.','error');return;}
      const btn=mount.querySelector('[data-checkout-save]');btn.disabled=true;const {data,error}=await db.rpc('fz_admin_update_booking_final_bill',{p_booking_id:b.id,p_items:items,p_discount_amount:Number(mount.querySelector('[data-checkout-discount]').value||0),p_tax_rate:Number(mount.querySelector('[data-checkout-tax]').value||0)});btn.disabled=false;
      if(error){show(status,error.message,'error');return;}mount.innerHTML='';await Promise.all([loadFinance(),loadBookings()]);await downloadInvoice(b.invoice_id,{mode:'final',download:true});alert(`Final bill saved. Total ${money(data?.[0]?.total_amount||0)} · Paid ${money(data?.[0]?.amount_paid||0)} · Remaining ${money(data?.[0]?.balance_due||0)}. Record the remaining payment after receiving it.`);
    });
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
    $('#fieldInvoicesList').innerHTML=invoices.map(x=>`<article class="field-record-card compact"><div class="field-record-main"><b>${esc(x.invoice_number)} · ${esc(x.customer_name)}</b><small>${esc(x.invoice_date)} · ${esc(x.status.toUpperCase())}</small><p>Total ${money(x.total_amount)} · Paid ${money(x.amount_paid)} · Due ${money(x.balance_due)}</p></div><div class="field-record-actions"><button class="button button-ghost" data-invoice-pdf="${esc(x.id)}">${x.status==='paid'?'FINAL PAID INVOICE':'INVOICE PDF'}</button>${Number(x.balance_due)>0&&x.status!=='void'?`<button class="button button-lime" data-invoice-pay="${esc(x.id)}">RECORD PAYMENT</button>`:''}</div></article>`).join('')||'<div class="empty-state">No invoices yet. Issue a deposit invoice from a booking, then record the advance when it is received.</div>';
    $('#fieldInvoicesList').querySelectorAll('[data-invoice-pdf]').forEach(btn=>btn.addEventListener('click',()=>downloadInvoice(btn.dataset.invoicePdf)));
    $('#fieldInvoicesList').querySelectorAll('[data-invoice-pay]').forEach(btn=>btn.addEventListener('click',()=>recordPayment(btn.dataset.invoicePay)));
    $('#fieldCashbookList').innerHTML=cashbook.slice(0,12).map(x=>`<div class="field-mini-row"><div><b>${esc(x.category)}</b><small>${esc(x.entry_date)} · ${esc(x.description)}</small></div><strong class="${x.entry_type==='expense'?'negative':''}">${x.entry_type==='expense'?'-':'+'}${money(x.amount)}</strong></div>`).join('')||'<p>No cashbook entries yet.</p>';
    $('#fieldCashbookForm').elements.entry_date.value=today();
    renderBookings();
  }

  async function downloadInvoice(invoiceId, options={}) {
    if(!window.jspdf?.jsPDF)throw new Error('PDF library could not load.');
    const mode=options.mode||'auto',download=options.download!==false;
    const [i,items,bookingQ,paymentsQ]=await Promise.all([
      db.from('fz_invoices').select('*').eq('id',invoiceId).single(),
      db.from('fz_invoice_items').select('description,quantity,unit_price,line_total').eq('invoice_id',invoiceId).order('line_number'),
      db.from('arena_bookings').select('booking_reference,deposit_required_amount,advance_verified_at,checkout_finalized_at,booking_start,booking_end,experience,player_count,arena_fields(name)').eq('invoice_id',invoiceId).maybeSingle(),
      db.from('fz_invoice_payments').select('*').eq('invoice_id',invoiceId).order('payment_date',{ascending:true})
    ]);
    if(i.error||!i.data)throw i.error||new Error('Invoice not found.');if(items.error)throw items.error;if(paymentsQ.error)throw paymentsQ.error;
    const inv=i.data,booking=bookingQ.data||{},rows=items.data||[],payments=paymentsQ.data||[];
    const pay=options.paymentId?payments.find(x=>x.id===options.paymentId):mode==='receipt'?payments[payments.length-1]:null;
    const isAdvance=mode==='advance'||(mode==='auto'&&!!booking.booking_reference&&!booking.checkout_finalized_at&&Number(inv.amount_paid||0)>=500),isFinal=mode==='final'||(mode==='auto'&&!!booking.checkout_finalized_at);
    const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const W=210,dark=[15,22,17],lime=[185,255,64],muted=[101,113,101],light=[241,245,237],line=[218,225,214],white=[255,255,255];
    const fmt=n=>Number(n||0).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2});
    const footer=()=>{doc.setDrawColor(...lime);doc.setLineWidth(1);doc.line(14,284,196,284);doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(...dark);doc.text(String(invoiceSettings.invoice_footer||'Thank you for choosing FIELDZERO.'),14,290,{maxWidth:180});doc.setFont('helvetica','normal');doc.setFontSize(5.8);doc.setTextColor(...muted);doc.text('FIELDZERO · SYSTEM-GENERATED FINANCIAL DOCUMENT',14,295);};
    const header=()=>{doc.setFillColor(...dark);doc.rect(0,0,W,57,'F');doc.setFillColor(...lime);doc.rect(0,0,4,57,'F');doc.setFillColor(...lime);doc.roundedRect(14,13,24,24,2,2,'F');doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('FZ',19,29);doc.setTextColor(...white);doc.setFontSize(14);doc.text('FIELDZERO',45,21);doc.setTextColor(...lime);doc.setFontSize(6.8);doc.text('OWN THE FIELD. BUILD YOUR SQUAD.',45,28);const title=mode==='receipt'?'PAYMENT RECEIPT':isAdvance?'ADVANCE PAID INVOICE':isFinal?(inv.status==='paid'?'FINAL PAID INVOICE':'FINAL INVOICE'):(inv.status==='paid'?'PAID INVOICE':'INVOICE');doc.setTextColor(...white);doc.setFontSize(title.length>18?11:14);doc.text(title,196,20,{align:'right'});doc.setTextColor(206,216,202);doc.setFontSize(7.2);doc.text(inv.invoice_number||'',196,29,{align:'right'});const badge=mode==='receipt'?'PAYMENT RECEIVED':isAdvance?'ADVANCE RECEIVED':inv.status==='paid'?'PAID IN FULL':inv.status==='partially_paid'?'PART PAYMENT':'PAYMENT DUE';const bw=Math.max(32,doc.getTextWidth(badge)+9);doc.setFillColor(...lime);doc.roundedRect(196-bw,36,bw,8,1.5,1.5,'F');doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(6.5);doc.text(badge,196-bw/2,41.3,{align:'center'});doc.setTextColor(206,216,202);doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.text(`BOOKING / ${booking.booking_reference||'GENERAL INVOICE'}`,14,49);};
    header();
    doc.setFillColor(...light);doc.roundedRect(14,65,88,39,2,2,'F');doc.roundedRect(108,65,88,39,2,2,'F');doc.setFont('helvetica','bold');doc.setFontSize(6.5);doc.setTextColor(...muted);doc.text('ISSUED BY',19,73);doc.text('CUSTOMER',113,73);doc.setFontSize(10);doc.setTextColor(...dark);doc.text(doc.splitTextToSize(String(invoiceSettings.business_name||field.name),78),19,81);doc.text(doc.splitTextToSize(String(inv.customer_name||''),78),113,81);doc.setFont('helvetica','normal');doc.setFontSize(6.7);doc.setTextColor(...muted);const issuer=[invoiceSettings.legal_name,invoiceSettings.address||field.address,invoiceSettings.phone,invoiceSettings.email].filter(Boolean);let iy=88;issuer.slice(0,3).forEach(v=>{doc.text(doc.splitTextToSize(String(v),78),19,iy);iy+=4;});const customer=[inv.customer_phone,inv.customer_email].filter(Boolean);let cy=88;customer.slice(0,3).forEach(v=>{doc.text(doc.splitTextToSize(String(v),78),113,cy);cy+=4;});
    doc.setFillColor(...dark);doc.roundedRect(14,112,182,18,2,2,'F');const meta=[['INVOICE DATE',inv.invoice_date||'—'],['DUE DATE',inv.due_date||'—'],['CURRENCY',inv.currency||'LKR'],['REFERENCE',pay?.receipt_number||booking.booking_reference||'—']];const mx=[19,65,111,151];meta.forEach((r,n)=>{doc.setTextColor(...lime);doc.setFont('helvetica','bold');doc.setFontSize(5.8);doc.text(r[0],mx[n],118);doc.setTextColor(...white);doc.setFont('helvetica','normal');doc.setFontSize(6.8);doc.text(String(r[1]).slice(0,26),mx[n],125);});
    const sessionLabel=[booking.arena_fields?.name,booking.booking_start?new Date(booking.booking_start).toLocaleString('en-GB',{timeZone:'Asia/Colombo',dateStyle:'medium',timeStyle:'short'}):'',booking.experience,booking.player_count?`${booking.player_count} player(s)`:'' ].filter(Boolean).join(' · ');if(sessionLabel){doc.setFont('helvetica','bold');doc.setFontSize(6.4);doc.setTextColor(...muted);doc.text('FIELD / SESSION',14,138);doc.setFont('helvetica','normal');doc.setTextColor(...dark);doc.setFontSize(7);doc.text(doc.splitTextToSize(sessionLabel,170),54,138);}
    let y=150;const tableHead=()=>{doc.setFillColor(...dark);doc.roundedRect(14,y,182,9,1,1,'F');doc.setFont('helvetica','bold');doc.setTextColor(...white);doc.setFontSize(6.8);doc.text('DESCRIPTION',19,y+6);doc.text('QTY',132,y+6,{align:'right'});doc.text('UNIT PRICE',161,y+6,{align:'right'});doc.text('AMOUNT',191,y+6,{align:'right'});y+=9;};tableHead();
    rows.forEach((row,n)=>{const desc=doc.splitTextToSize(String(row.description||''),101),h=Math.max(12,desc.length*4+6);if(y+h>258){footer();doc.addPage();header();y=69;tableHead();}if(n%2===0){doc.setFillColor(...light);doc.rect(14,y,182,h,'F');}doc.setFont('helvetica','normal');doc.setFontSize(7.6);doc.setTextColor(...dark);doc.text(desc,19,y+7);doc.text(String(Number(row.quantity)),132,y+7,{align:'right'});doc.text(fmt(row.unit_price),161,y+7,{align:'right'});doc.setFont('helvetica','bold');doc.text(fmt(row.line_total),191,y+7,{align:'right'});y+=h;doc.setDrawColor(...line);doc.line(14,y,196,y);});
    y+=9;if(y>220){footer();doc.addPage();header();y=69;}const boxY=y;doc.setFillColor(...dark);doc.roundedRect(14,boxY,182,54,2,2,'F');doc.setTextColor(...lime);doc.setFont('helvetica','bold');doc.setFontSize(7);doc.text(mode==='receipt'?'PAYMENT SUMMARY':isAdvance?'ADVANCE PAYMENT SUMMARY':isFinal?'FINAL PAYMENT SUMMARY':'INVOICE SUMMARY',20,boxY+9);const totals=[['SUBTOTAL',fmt(inv.subtotal_amount)],...(Number(inv.discount_amount)>0?[['DISCOUNT','-'+fmt(inv.discount_amount)]]:[]),...(Number(inv.tax_amount)>0?[['TAX',fmt(inv.tax_amount)]]:[]),['INVOICE TOTAL',fmt(inv.total_amount)],['TOTAL RECEIVED',fmt(inv.amount_paid)],['BALANCE DUE',fmt(inv.balance_due)]];let ty=boxY+17;totals.forEach((r,n)=>{doc.setFont('helvetica',n>=totals.length-2?'bold':'normal');doc.setFontSize(n>=totals.length-2?8.3:6.5);doc.setTextColor(n>=totals.length-2?lime:white);doc.text(r[0],20,ty);doc.text(`LKR ${r[1]}`,190,ty,{align:'right'});ty+=6.2;});
    y=boxY+61;if(pay){if(y>257){footer();doc.addPage();header();y=69;}doc.setFillColor(...light);doc.roundedRect(14,y,182,27,2,2,'F');doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(7.2);doc.text(isAdvance?'ADVANCE PAYMENT VERIFIED':'PAYMENT RECEIVED',19,y+7);doc.setFont('helvetica','normal');doc.setFontSize(6.8);doc.setTextColor(...muted);doc.text(`${pay.payment_date||''} · ${String(pay.payment_method||'').toUpperCase()} · ${pay.receipt_number||''}`,19,y+14);if(pay.reference)doc.text(`Reference: ${String(pay.reference).slice(0,72)}`,19,y+21);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(...dark);doc.text(`LKR ${fmt(pay.amount)}`,190,y+14,{align:'right'});y+=33;}
    if(booking.advance_verified_at){doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(...muted);doc.text(`ADVANCE VERIFIED · ${new Date(booking.advance_verified_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})}`,14,y);}
    if(mode==='receipt'&&pay){doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(...muted);doc.text('This receipt acknowledges only the amount shown for this payment. The invoice displays the cumulative booking balance.',14,270,{maxWidth:180});}
    else if(inv.notes||inv.terms||invoiceSettings.payment_instructions){let ny=Math.max(y+8,250);doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(...muted);[inv.notes,inv.terms,invoiceSettings.payment_instructions].filter(Boolean).forEach(t=>{const lines=doc.splitTextToSize(String(t),180);if(ny+lines.length*3.5>278){footer();doc.addPage();header();ny=69;}doc.text(lines,14,ny);ny+=lines.length*3.5+2;});}
    footer();const blob=doc.output('blob');const filename=`${mode==='receipt'?(pay?.receipt_number||inv.invoice_number):inv.invoice_number}-${mode==='advance'?'ADVANCE':mode==='final'?'FINAL':mode==='receipt'?'RECEIPT':'INVOICE'}.pdf`;
    if(download)downloadBlob(blob,filename);return {blob,filename,invoice:inv,payment:pay};
  }

  async function recordPayment(invoiceId) {
    const inv=invoices.find(x=>x.id===invoiceId);if(!inv)return;
    if(!accounts.some(x=>x.active)){alert('Create an active financial account first.');return;}
    const linkedBooking=bookings.find(x=>x.invoice_id===invoiceId);
    if(linkedBooking&&!linkedBooking.checkout_finalized_at){alert('Prepare and save the final checkout bill first. Add the session fee and any extras before collecting the remaining balance.');return;}
    const amountText=prompt(`Amount received (maximum ${money(inv.balance_due)}):`,String(inv.balance_due));if(amountText===null)return;
    const amount=Number(amountText);if(!Number.isFinite(amount)||amount<=0||amount>Number(inv.balance_due)){alert('Enter a valid payment up to the outstanding balance.');return;}
    const methods=['cash','bank','card','online','other'];const methodText=prompt('Payment method: cash, bank, card, online or other','cash');if(methodText===null)return;const method=methodText.trim().toLowerCase();if(!methods.includes(method)){alert('Unsupported payment method.');return;}
    const active=accounts.filter(x=>x.active),list=active.map((x,n)=>`${n+1}. ${x.account_name}`).join('\n');const choice=prompt(`Select receiving account:\n${list}`,'1');if(choice===null)return;const account=active[Number(choice)-1];if(!account){alert('Invalid account selection.');return;}
    const reference=prompt('Bank / card transaction reference (optional):','')||'';
    const {data,error}=await db.rpc('fz_admin_record_invoice_payment',{p_invoice_id:invoiceId,p_amount:amount,p_payment_date:today(),p_payment_method:method,p_account_id:account.id,p_reference:reference,p_received_by:user.email||'Field admin',p_request_key:crypto.randomUUID()});
    if(error){alert(`Payment not recorded: ${error.message}`);return;}
    await loadFinance();const receipt=await downloadInvoice(invoiceId,{mode:'receipt',paymentId:data,download:true});
    const fresh=invoices.find(x=>x.id===invoiceId);if(fresh&&Number(fresh.balance_due)<=0){await downloadInvoice(invoiceId,{mode:'final',download:true});alert(`Payment recorded. ${receipt.filename} and the FINAL PAID INVOICE have been downloaded.`);}else alert(`Payment recorded. ${receipt.filename} downloaded. Remaining balance: ${money(fresh?.balance_due||0)}.`);
    await loadBookings();renderOverview();
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
    invoiceSettings=payload;show($('#fieldInvoiceSettingsStatus'),'Invoice identity saved. The booking advance is fixed at LKR 500.','success');
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
