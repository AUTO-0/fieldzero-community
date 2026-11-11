
(()=>{
"use strict";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const conf=window.FIELDZERO_CONFIG||{};
const db=window.supabase?.createClient(conf.SUPABASE_URL,conf.SUPABASE_ANON_KEY);
const recoveryLink=new URLSearchParams(location.hash.replace(/^#/,"")).get("type")==="recovery";
let recoveryMode=recoveryLink;
const showRecovery=()=>{$("#loginSection").hidden=true;$("#workspace").hidden=true;$("#staffRecovery").hidden=false;};
db?.auth.onAuthStateChange((event,session)=>{if(event==="PASSWORD_RECOVERY"){recoveryMode=true;showRecovery();}});
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number(v||0).toLocaleString("en-LK",{maximumFractionDigits:2});
const money=v=>"LKR "+fmt(v), dt=v=>v?new Date(v).toLocaleString("en-LK",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Colombo"}):"—";
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
let user=null,owner=false,fields=[],bookings=[],applications=[],prices=[],accounts=[],invoice=null,invoiceItems=[],payments=[],selectedId=null,confirmations=[];
const msg=(text,error=false,element=$("#workMessage"))=>{if(element){element.textContent=text;element.classList.toggle("error",error);}};
const fieldId=()=>$("#fieldFilter").value;
const action=async(fn,success)=>{msg("Processing request…");try{await fn();msg(success||"Saved successfully.");await loadBookings();await loadOperators();if(selectedId)await showBooking(selectedId);}catch(e){msg(e.message||String(e),true);}};
const rpc=async(name,args)=>{const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data;};
function drawFields(){
 $("#fieldFilter").innerHTML=fields.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join("");
 $("#workerField").innerHTML=$("#fieldFilter").innerHTML;
}
async function initialize(){
 const {data:{user:account},error}=await db.auth.getUser();if(error||!account)return;
 user=account;
 const {data:admin}=await db.rpc("is_fieldzero_admin");owner=admin===true;
 let all=[];
 if(owner){
  const response=await db.from("arena_fields").select("id,name,active").eq("active",true).order("name");
  if(response.error)throw Error(response.error.message);all=response.data||[];
 }else{
  const response=await db.from("fz_workers").select("field_id,active").eq("user_id",user.id).eq("active",true);
  if(response.error)throw Error(response.error.message);
  const ids=(response.data||[]).map(x=>x.field_id);
  if(ids.length){const f=await db.from("arena_fields").select("id,name,active").in("id",ids).eq("active",true);if(f.error)throw Error(f.error.message);all=f.data||[];}
 }
 if(!all.length){$("#loginSection").hidden=false;msg("No active FIELDZERO worker access. Ask the owner to assign you to a field.",true,$("#loginMessage"));return;}
 fields=all;drawFields();
 $("#loginSection").hidden=true;$("#workspace").hidden=false;$("#logout").hidden=false;
 $("#signedInAs").textContent=(owner?"OWNER":"WORKER")+" / "+(user.email||"");
 $("#workerTab").hidden=!owner;
 const p=await db.from("public_session_prices").select("package_name,price_amount,price_note");
 if(!p.error)prices=p.data||[];
 await refresh();
}
async function refresh(){selectedId=null;$("#bookingDetail").innerHTML="<p>Select a booking to view its workflow.</p>";await Promise.all([loadBookings(),loadOperators(),loadAccounts()]);if(owner)await loadWorkers();}
async function loadAccounts(){
 const {data,error}=await db.from("fz_financial_accounts").select("id,account_name,account_type,active").eq("field_id",fieldId()).eq("active",true);
 if(error){msg(error.message,true);accounts=[];}else accounts=data||[];
}
function priceFor(b){
 const p=prices.find(x=>x.package_name===b.experience);
 if(!p||p.price_amount==null)return 0;
 const unit=(p.price_note||"").toLowerCase();
 return Number(p.price_amount)*(unit.includes("per player")?Number(b.player_count||1):1);
}
function summarize(b){
 const status=b.status==="approved"?(b.payment_status==="paid"?"PAID / APPROVED":"CONFIRMED"):b.status;
 return '<span class="pill">'+esc(status)+'</span>';
}
async function loadBookings(){
 const raw=String($("#bookingSearch")?.value||"").trim();
 const q=raw.replace(/[^A-Za-z0-9_+\-]/g,"");
 let request=db.from("arena_bookings").select("*").eq("field_id",fieldId());
 if(q.length>=3)request=request.or("booking_reference.ilike.%"+q+"%,mobile.ilike.%"+q+"%,callsign.ilike.%"+q+"%");
 const {data,error}=await request.order("booking_start",{ascending:false}).limit(q.length>=3?100:300);
 if(error){msg(error.message,true);return;}
 bookings=data||[];
 const {data:sent}=await db.from("fz_booking_confirmations").select("booking_id").in("booking_id",bookings.map(x=>x.id).length?bookings.map(x=>x.id):["00000000-0000-0000-0000-000000000000"]);
 confirmations=sent||[];
 const filter=$("#bookingStatusFilter").value;
 const searching=String($("#bookingSearch")?.value||"").replace(/[^A-Za-z0-9_+\-]/g,"").length>=3;
 const filtered=bookings.filter(b=>searching||filter==="all"||
 (filter==="active"&&!["rejected","cancelled"].includes(b.status)&&(!["paid"].includes(b.payment_status)||new Date(b.booking_start)>new Date(Date.now()-86400000)))||
 (filter==="pending"&&["pending","pending_payment"].includes(b.status))||
 (filter==="paid"&&b.payment_status==="paid"));
 $("#bookingsList").innerHTML=filtered.length?filtered.map(b=>
 '<button class="record clickable '+(selectedId===b.id?"active":"")+'" data-booking="'+esc(b.id)+'"><b>'+esc(b.booking_reference||"BOOKING")+' · '+esc(b.experience||"Field game")+'</b><div class="meta">'+summarize(b)+' <small>'+dt(b.booking_start)+'</small></div><small>'+esc(b.real_name)+' · '+esc(b.player_count)+' players</small></button>').join("")
 :'<div class="panel"><p>No bookings in this filter.</p></div>';
 $$("[data-booking]").forEach(button=>button.onclick=()=>showBooking(button.dataset.booking));
}
async function showBooking(id){
 selectedId=id;const b=bookings.find(x=>x.id===id);if(!b)return;
 $("#bookingsList").querySelectorAll("[data-booking]").forEach(el=>el.classList.toggle("active",el.dataset.booking===id));
 invoice=null;invoiceItems=[];payments=[];
 if(b.invoice_id){
  const [i,lines,paid]=await Promise.all([
   db.from("fz_invoices").select("*").eq("id",b.invoice_id).maybeSingle(),
   db.from("fz_invoice_items").select("*").eq("invoice_id",b.invoice_id).order("line_number"),
   db.from("fz_invoice_payments").select("*").eq("invoice_id",b.invoice_id).order("created_at",{ascending:false})]);
  if(i.error||lines.error||paid.error){msg(i.error?.message||lines.error?.message||paid.error?.message,true);}
  invoice=i.data;invoiceItems=lines.data||[];payments=paid.data||[];
 }
 const preview=priceFor(b);
 const isSent=confirmations.some(x=>x.booking_id===id);
 const accountOptions=accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.account_name)+'</option>').join("");
 const paymentControls='<div class="controls"><label>RECEIVING ACCOUNT<select id="payAccount">'+accountOptions+'</select></label><label>METHOD<select id="payMethod"><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="card">Card</option><option value="online">Online</option><option value="other">Other</option></select></label><label class="wide">PAYMENT REFERENCE<input id="payReference" placeholder="Optional receipt / bank reference"></label></div>';
 let out='<span class="kicker">BOOKING / '+esc(b.booking_reference||"")+'</span><h3>'+esc(b.experience||"FIELD GAME")+'</h3>'+summarize(b)+
 '<dl><dt>CUSTOMER</dt><dd>'+esc(b.real_name)+'</dd><dt>CONTACT</dt><dd>'+esc(b.mobile)+'</dd><dt>START</dt><dd>'+dt(b.booking_start)+'</dd><dt>PLAYERS</dt><dd>'+esc(b.player_count)+'</dd><dt>BOOKING TYPE</dt><dd>'+(b.special_request?"SPECIAL":"STANDARD")+'</dd><dt>PAYMENT</dt><dd>'+esc(b.payment_status||"not invoiced")+'</dd><dt>REQUEST NOTES</dt><dd>'+esc(b.notes||"—")+'</dd></dl>';
 if(b.special_request&&b.status==="pending")out+='<div class="action-block"><h4>01 / REVIEW SPECIAL REQUEST</h4><label>REPLY TO CUSTOMER<textarea id="specialReply" placeholder="Approval information or reason for rejection"></textarea></label><div class="button-row"><button class="primary" id="approveSpecial">APPROVE REQUEST</button><button class="danger" id="rejectSpecial">REJECT REQUEST</button></div></div>';
 if(b.status==="pending_payment"&&Number(b.deposit_required_amount||0)>0)out+='<div class="action-block"><h4>02 / RECORD BOOKING ADVANCE</h4><p class="hint">Verify the actual LKR 500 payment first. Recording an advance also creates the invoice and confirms the reservation.</p>'+paymentControls+'<button id="recordAdvance" class="primary">RECORD VERIFIED LKR 500 ADVANCE</button></div>';
 if(b.status==="approved"){
  const mobile=String(b.mobile||"").replace(/\D/g,"").replace(/^0/,"94");
  const whatsapp=/^94\d{9}$/.test(mobile)?"https://wa.me/"+mobile+"?text="+encodeURIComponent("FIELDZERO RESERVATION CONFIRMATION\nReference: "+(b.booking_reference||"")+"\n"+(b.experience||"")+" / "+dt(b.booking_start)+"\nPlayers: "+b.player_count+"\nBring your booking reference and arrive 15 minutes early. Opening date and field readiness subject to confirmation."):"";
  out+='<div class="action-block"><h4>03 / SEND CONFIRMATION</h4><p class="hint">'+(isSent?"Marked as sent in FIELDZERO.":"Open WhatsApp, send the prepared confirmation, then mark it sent.")+'</p><div class="button-row">'+(whatsapp?'<a class="primary" style="padding:12px;border-radius:8px;color:#102015" target="_blank" rel="noopener" href="'+esc(whatsapp)+'">OPEN WHATSAPP ↗</a>':'<span class="alert">Check customer phone number</span>')+'<button class="ghost" id="markSent">MARK MESSAGE SENT</button></div></div>';
  if(!invoice)out+='<div class="action-block"><h4>04 / PREPARE ARRIVAL INVOICE</h4><p class="hint">No booking advance was required. Issue the invoice when the customer arrives.</p><label>SESSION TOTAL (LKR)<input type="number" min="1" step=".01" id="arrivalTotal" value="'+esc(preview||"")+'"></label><button class="primary" id="arrivalInvoice">CREATE INVOICE</button></div>';
  else{
   out+='<div class="action-block"><h4>04 / CHECKOUT & INVOICE</h4><p class="hint">'+esc(invoice.invoice_number)+' · Total '+money(invoice.total_amount)+' · Paid '+money(invoice.amount_paid)+' · Balance '+money(invoice.balance_due)+'</p><label>SESSION CHARGE (LKR)<input id="billPrice" type="number" min="1" step=".01" value="'+esc(preview||invoice.total_amount)+'"></label><label>ADDITIONAL CHARGES (LKR)<input id="billExtra" type="number" min="0" step=".01" value="0"></label><label>ADDITIONAL ITEMS DESCRIPTION<input id="billExtraDescription" placeholder="Optional extra purchases"></label><div class="button-row"><button id="finalBill" class="ghost">FINALIZE / UPDATE BILL</button><button id="downloadInvoice" class="ghost">DOWNLOAD INVOICE PDF</button></div>';
   if(Number(invoice.balance_due)>0)out+='<div style="margin-top:15px"><p class="hint">Only record money after verifying it has been received. Current balance '+money(invoice.balance_due)+'.</p>'+paymentControls+'<label>AMOUNT RECEIVED (LKR)<input id="paymentAmount" type="number" min=".01" step=".01" value="'+esc(invoice.balance_due)+'"></label><button id="receivePayment" class="primary">RECORD PAYMENT & ISSUE RECEIPT</button></div>';
   out+='</div>';
  }
  out+='<div class="action-block"><h4>05 / GAME & EQUIPMENT</h4><a class="section-link" href="inventory.html?booking='+encodeURIComponent(b.id)+'">OPEN GAME SESSION / ISSUE EQUIPMENT ↗</a></div>';
 }
 if(payments.length)out+='<div class="action-block"><h4>PAYMENT HISTORY</h4>'+payments.map(p=>'<p class="mini">'+esc(p.receipt_number)+' / '+money(p.amount)+' / '+esc(p.payment_method)+' / '+esc(p.payment_date)+'</p>').join("")+'</div>';
 $("#bookingDetail").innerHTML=out;
 const assign=(key,handler)=>{const el=$("#"+key);if(el)el.onclick=()=>action(handler);};
 assign("approveSpecial",()=>rpc("fz_staff_review_special_booking",{p_booking_id:id,p_decision:"approve",p_message:$("#specialReply").value}));
 assign("rejectSpecial",()=>rpc("fz_staff_review_special_booking",{p_booking_id:id,p_decision:"reject",p_message:$("#specialReply").value}));
 assign("markSent",()=>rpc("fz_staff_mark_confirmation",{p_booking_id:id}));
 assign("arrivalInvoice",()=>rpc("fz_staff_create_arrival_invoice",{p_booking_id:id,p_total_amount:Number($("#arrivalTotal").value)}));
 const payParams=()=>({p_payment_method:$("#payMethod").value,p_account_id:$("#payAccount").value||null,p_reference:$("#payReference").value.trim(),p_payment_date:today(),p_received_by:user.email||"Staff"});
 assign("recordAdvance",()=>rpc("fz_staff_record_advance",{p_booking_id:id,...payParams()}));
 assign("finalBill",()=>{const amount=Number($("#billPrice").value),extra=Number($("#billExtra").value);
  const items=[{description:(b.experience||"FIELDZERO session")+" / "+b.booking_reference,quantity:1,unit_price:amount}];
  if(extra>0)items.push({description:$("#billExtraDescription").value.trim()||"Additional field charges",quantity:1,unit_price:extra});
  return rpc("fz_staff_finalize_bill",{p_booking_id:id,p_items:items,p_discount_amount:0,p_tax_rate:0});});
 assign("receivePayment",()=>rpc("fz_staff_record_payment",{p_invoice_id:invoice.id,p_amount:Number($("#paymentAmount").value),p_payment_date:today(),...payParams(),p_request_key:crypto.randomUUID()}));
 if($("#downloadInvoice"))$("#downloadInvoice").onclick=downloadInvoice;
  if(b.status==="approved" && window.FZVisitV25)window.FZVisitV25.render(b,invoice,()=>action(async()=>{}));
}
async function loadOperators(){
 const {data,error}=await db.from("player_applications").select("id,callsign,real_name,mobile,contact_email,status,created_at").order("created_at",{ascending:false}).limit(150);
 if(error){$("#operatorsList").innerHTML='<p class="alert">'+esc(error.message)+'</p>';return;}
 applications=data||[];
 $("#operatorsList").innerHTML=applications.length?applications.map(a=>'<article class="record"><b>'+esc(a.callsign)+' '+(a.status==="pending"?'<span class="pill">PENDING</span>':'<span class="pill">'+esc(a.status)+'</span>')+'</b><small>'+esc(a.real_name)+' / '+esc(a.mobile)+' / '+esc(a.contact_email||"")+'</small><small>'+dt(a.created_at)+'</small>'+(a.status==="pending"?'<div class="button-row"><button class="primary" data-operator-decision="approve" data-id="'+esc(a.id)+'">APPROVE</button><button class="danger" data-operator-decision="reject" data-id="'+esc(a.id)+'">REJECT</button></div>':"")+'</article>').join(""):'<p>No operator requests yet.</p>';
 $$("[data-operator-decision]").forEach(btn=>btn.onclick=()=>action(()=>rpc("fz_staff_review_operator",{application_id:btn.dataset.id,decision:btn.dataset.operatorDecision})));
}
async function loadWorkers(){
 if(!owner)return;
 const {data,error}=await db.functions.invoke("fieldzero-worker-admin",{body:{action:"list"}});
 if(error||data?.error){msg(data?.error||error?.message||"Worker service unavailable",true);return;}
 $("#workersList").innerHTML=(data.workers||[]).map(w=>'<article class="record"><b>'+esc(w.display_name)+'</b><small>'+esc(w.email)+' · '+esc(fields.find(f=>f.id===w.field_id)?.name||w.field_id)+'</small><div class="meta"><span class="pill">'+(w.active?"ACTIVE":"DISABLED")+'</span><button class="ghost" data-worker-toggle="'+esc(w.id)+'" data-worker-active="'+(!w.active)+'">'+(w.active?"DISABLE ACCESS":"ENABLE ACCESS")+'</button></div></article>').join("")||"<p>No worker accounts yet.</p>";
 $$("[data-worker-toggle]").forEach(button=>button.onclick=()=>action(async()=>{
 const {data,error}=await db.functions.invoke("fieldzero-worker-admin",{body:{action:"set_active",id:button.dataset.workerToggle,active:button.dataset.workerActive==="true"}});
 if(error||data?.error)throw Error(data?.error||error.message);
 await loadWorkers();
 }));
}
function downloadInvoice(){
 if(!invoice||!window.jspdf){msg("PDF engine unavailable",true);return;}
 const {jsPDF}=window.jspdf,doc=new jsPDF();const width=210;
 doc.setFillColor(16,28,20);doc.rect(0,0,width,46,"F");doc.setTextColor(202,238,127);doc.setFont("helvetica","bold");doc.setFontSize(27);doc.text("FIELDZERO",15,23);
 doc.setFontSize(10);doc.text("OPERATIONS / TAX INVOICE",15,33);
 doc.setTextColor(35,45,36);doc.setFontSize(11);doc.text("INVOICE  "+invoice.invoice_number,15,59);
 doc.text("Customer: "+invoice.customer_name,15,69);
 doc.text("Date: "+invoice.invoice_date,15,77);
 let y=91;doc.setFont("helvetica","bold");doc.text("DESCRIPTION",15,y);doc.text("AMOUNT",164,y);y+=7;
 doc.setFont("helvetica","normal");
 invoiceItems.forEach(line=>{const description=doc.splitTextToSize(String(line.description||""),125);doc.text(description,15,y);doc.text(fmt(line.line_total),164,y);y+=Math.max(8,description.length*6);});
 y+=10;doc.setFont("helvetica","bold");
 doc.text("TOTAL: "+money(invoice.total_amount),15,y);y+=8;doc.text("PAID: "+money(invoice.amount_paid),15,y);y+=8;doc.text("BALANCE: "+money(invoice.balance_due),15,y);y+=14;
 doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text("Receipt history",15,y);y+=7;payments.forEach(p=>{doc.text(p.receipt_number+" / "+money(p.amount)+" / "+p.payment_method,15,y);y+=7;});
 doc.setFontSize(9);doc.text("Issued by FIELDZERO field operations / "+(invoice.status||""),15,278);
 doc.save((invoice.invoice_number||"FIELDZERO-INVOICE")+".pdf");
}
$("#loginForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);msg("Signing in…",false,$("#loginMessage"));const {error}=await db.auth.signInWithPassword({email:String(f.get("email")).trim(),password:String(f.get("password"))});if(error){msg(error.message,true,$("#loginMessage"));return;}try{await initialize();}catch(err){msg(err.message,true,$("#loginMessage"));}};
$("#logout").onclick=async()=>{await db.auth.signOut();location.reload();};
$("#refresh").onclick=refresh;
let findDebounce;$("#bookingSearch")?.addEventListener("input",()=>{clearTimeout(findDebounce);findDebounce=setTimeout(loadBookings,220);});
$("#fieldFilter").onchange=refresh;$("#bookingStatusFilter").onchange=loadBookings;
$$("[data-tab]").forEach(t=>t.onclick=()=>{$$("[data-tab]").forEach(b=>b.classList.toggle("active",b===t));$$("[data-panel]").forEach(p=>p.hidden=p.dataset.panel!==t.dataset.tab);});
$("#generatePassword").onclick=()=>{const abc="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";const bytes=crypto.getRandomValues(new Uint8Array(20));$("#workerPassword").value=[...bytes].map(b=>abc[b%abc.length]).join("");};
$("#workerForm").onsubmit=async e=>{
 e.preventDefault();const f=new FormData(e.currentTarget);const body={action:"create",email:String(f.get("email")).trim(),display_name:String(f.get("display_name")).trim(),password:String(f.get("password")),field_id:String(f.get("field_id"))};
 msg("Creating staff account…",false,$("#workerFormStatus"));
 const {data,error}=await db.functions.invoke("fieldzero-worker-admin",{body});
 if(error||data?.error){msg(data?.error||error.message,true,$("#workerFormStatus"));return;}
 msg("Worker created. Share their email and temporary password privately. This password is not shown again.",false,$("#workerFormStatus"));e.currentTarget.reset();await loadWorkers();
};
$("#forgotStaffPassword").onclick=async()=>{
 const address=$("#loginForm [name=email]").value.trim()||prompt("Enter your FIELDZERO worker email address:");
 if(!address)return;
 const {error}=await db.auth.resetPasswordForEmail(address,{redirectTo:location.origin+location.pathname});
 msg(error?error.message:"If that account exists, a password reset message will be emailed. Check the inbox and spam.",!!error,$("#loginMessage"));
};
$("#staffRecoveryForm").onsubmit=async e=>{
 e.preventDefault();
 const password=$("#staffRecoveryPassword").value,confirm=$("#staffRecoveryConfirm").value;
 if(password.length<12||password!==confirm){msg("Use at least 12 characters, and ensure passwords match.",true,$("#staffRecoveryStatus"));return;}
 const {error}=await db.auth.updateUser({password});
 if(error){msg(error.message,true,$("#staffRecoveryStatus"));return;}
 await db.auth.signOut();
 msg("Password changed. Return to the staff login page and sign in with the new password.",false,$("#staffRecoveryStatus"));
 setTimeout(()=>{location.href=location.pathname;},1600);
};
$("#staffChangePasswordForm").onsubmit=async e=>{
 e.preventDefault();
 const password=$("#staffChangePassword").value;
 if(password.length<12){msg("Use at least 12 characters.",true,$("#staffPasswordStatus"));return;}
 const {error}=await db.auth.updateUser({password});
 msg(error?error.message:"Password updated. Use the new password next time you sign in.",!!error,$("#staffPasswordStatus"));
 if(!error)e.currentTarget.reset();
};
db.auth.getSession().then(({data:{session}})=>{
 if(recoveryMode){if(session){showRecovery();}else{msg("Reset link is invalid or expired. Request another email.",true,$("#loginMessage"));}}
 else if(session)initialize().catch(e=>msg(e.message,true,$("#loginMessage")));
});
})();
