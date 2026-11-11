
/* FIELDZERO V25 — single-screen visitor check-in, inventory, checkout and invoice sharing */
(()=>{
"use strict";
const cfg=window.FIELDZERO_CONFIG||{};
const db=window.supabase?.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const amount=v=>Number(v||0).toLocaleString("en-LK",{minimumFractionDigits:0,maximumFractionDigits:2});
const time=v=>new Date(v).toLocaleString("en-LK",{timeZone:"Asia/Colombo",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const localDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const api=async(fn,params)=>{const {data,error}=await db.rpc(fn,params);if(error)throw Error(error.message);return data;};
const available=i=>Math.max(0,Number(i.stock_on_hand||0)-(i.kind==="reusable"?Number(i.outstanding_reusable||0):0));
const notify=(root,msg,error=false)=>{const el=root.querySelector("#visitStatus");if(el){el.textContent=msg;el.className="message"+(error?" error":"");}};
const classify=i=>{
 const k=(i.name+" "+i.category).toLowerCase();
 if(/blaster|rental gun|gel gun|rifle|pistol/.test(k))return "BLASTERS / RENTAL GUNS";
 if(/mask|eye|safety|glasses|goggle|vest|protect/.test(k))return "SAFETY EQUIPMENT";
 if(/gel ball|ammo|ammunition|gel bead|pellet/.test(k))return "GEL BALLS / CONSUMABLES";
 return "OTHER FIELD EQUIPMENT";
};
let revision=0;
async function render(booking,knownInvoice,afterChange){
 const rid=++revision;
 const root=document.querySelector("#bookingDetail");
 if(!root||!db)return;
 const old=root.querySelector("#fzVisitRoot");if(old)old.remove();
 // The legacy detailed checkout remains available in the admin dashboard,
 // but staff use this guided workflow instead of duplicate finance buttons.
 root.querySelectorAll(".action-block").forEach(el=>{
  if(el.querySelector("#arrivalInvoice")||el.querySelector("#finalBill")||el.querySelector("#receivePayment")||
     el.querySelector('a[href^="inventory.html?booking="]'))el.hidden=true;
 });
 const panel=document.createElement("section");panel.id="fzVisitRoot";panel.className="fz-visit";
 const heading=root.querySelector("dl");
 if(heading)heading.after(panel);else root.prepend(panel);
 panel.innerHTML='<p class="kicker">CUSTOMER ARRIVAL / ONE SCREEN</p><h3>FIELD VISIT & FINAL CHECKOUT</h3><p class="hint">Loading check-in details…</p><p class="message" id="visitStatus" aria-live="polite"></p>';
 const [stockResult,gameResult,priceResult,accountResult]=await Promise.all([
  db.from("fz_inventory_forecast").select("id,name,category,kind,unit,stock_on_hand,outstanding_reusable,active").eq("field_id",booking.field_id).order("name"),
  db.from("fz_game_sessions").select("*").eq("booking_id",booking.id).maybeSingle(),
  db.from("public_session_prices").select("package_name,price_amount,price_note").eq("package_name",booking.experience).maybeSingle(),
  db.from("fz_financial_accounts").select("id,account_name,active").eq("field_id",booking.field_id).eq("active",true)
 ]);
 if(rid!==revision||!panel.isConnected)return;
 const err=[stockResult,gameResult,priceResult,accountResult].find(x=>x.error);
 if(err){notify(panel,"Cannot load this booking: "+err.error.message,true);return;}
 const stock=(stockResult.data||[]).filter(x=>x.active);
 let game=gameResult.data,invoice=knownInvoice||null;
 const price=priceResult.data;
 const basePrice=price?.price_amount==null?Number(booking.quoted_amount||0):
 Number(price.price_amount)*((price.price_note||"").toLowerCase().includes("per player")?Number(booking.player_count):1);
 const accounts=accountResult.data||[];
 const isPaid=invoice&&invoice.status==="paid"&&Number(invoice.balance_due)===0;
 let lines=[],receipts=[],gear=[];
 if(invoice){
  const [a,b]=await Promise.all([
   db.from("fz_invoice_items").select("*").eq("invoice_id",invoice.id).order("line_number"),
   db.from("fz_invoice_payments").select("receipt_number,amount,payment_date,payment_method").eq("invoice_id",invoice.id).order("created_at")
  ]);
  if(a.error||b.error){notify(panel,a.error?.message||b.error?.message,true);return;}
  lines=a.data||[];receipts=b.data||[];
 }
 if(game){
  const res=await db.from("fz_inventory_issues").select("id,item_id,quantity,returned_qty").eq("session_id",game.id);
  if(res.error){notify(panel,res.error.message,true);return;}gear=res.data||[];
 }
 if(rid!==revision||!panel.isConnected)return;
 const details=game
  ?'<div class="fz-visit-status"><strong>'+esc(game.status==="completed"?"GAME COMPLETED":"CUSTOMER CHECKED IN")+'</strong><span>'+time(game.started_at)+' · '+Number(game.player_count)+' players</span></div>'+
    '<div class="fz-visit-gear">'+(gear.length?gear.map(x=>{
      const item=stock.find(i=>i.id===x.item_id);
      return '<div><b>'+esc(item?.name||"Inventory item")+'</b><span>'+amount(x.quantity)+' '+esc(item?.unit||"")+
        (item?.kind==="reusable"?" · Returned "+amount(x.returned_qty):" · Consumed")+'</span></div>';
    }).join(""):'<p class="hint">No items issued to this visit yet.</p>')+'</div>'+
    (game.status!=="completed"
     ?'<details class="fz-visit-extra-gear"><summary>ISSUE EXTRA GEAR TO THIS GAME ＋</summary><div class="fz-visit-grid"><label>ITEM<select id="visitExtraItem">'+stock.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+' · '+amount(available(i))+' '+esc(i.unit)+' available</option>').join("")+'</select></label><label>QUANTITY<input id="visitExtraQty" type="number" min="1" step="1" value="1"></label></div><button class="ghost" type="button" id="visitExtraIssue">ISSUE EXTRA ITEM</button></details>'+
     '<label class="fz-visit-confirm"><input type="checkbox" id="visitReturnVerified"> I physically counted and collected all reusable guns and safety equipment.</label><label>GAME NOTES<input id="visitFinishNote" placeholder="Game results / staff notes"></label><button class="ghost" id="visitFinish" type="button">COMPLETE GAME & RETURN VERIFIED EQUIPMENT</button>'
     :'<p class="hint">Game record closed. All issued gear and consumption remain in usage statistics.</p>')
  :'<p class="fz-visit-lead">Enter actual attendance and the equipment given to this group. One tap records the game and updates inventory statistics automatically.</p>'+
    '<div class="fz-visit-grid"><label>ACTUAL PLAYERS<input id="visitPlayers" type="number" min="1" max="100" required value="'+Number(booking.player_count||1)+'"></label><label>SESSION NOTES<input id="visitCheckinNote" maxlength="600" placeholder="Optional referee notes"></label></div>'+
    '<div class="fz-visit-stock">'+(stock.length?stock.map(i=>{
      const group=classify(i);
      const suggestion=i.kind==="reusable"&&(/BLASTERS/.test(group)||/SAFETY/.test(group))?Math.min(Number(booking.player_count||1),available(i)):0;
      return '<label class="fz-visit-item"><span><strong>'+esc(i.name)+'</strong><small>'+esc(group)+' · '+(i.kind==="reusable"?"RETURNABLE":"CONSUMABLE")+" · "+amount(available(i))+" "+esc(i.unit)+" available</small></span>"+
       '<input data-visit-stock="'+esc(i.id)+'" type="number" min="0" max="'+available(i)+'" step="'+(i.kind==="reusable"?"1":"0.01")+'" value="'+suggestion+'"></label>';
     }).join(""):'<p class="hint">No stock items have been configured. The owner can add guns, safety equipment and gel balls under Inventory.</p>')+'</div>'+
    '<button type="button" class="primary fz-visit-wide" id="visitCheckin">CHECK IN CUSTOMER & ISSUE ALL SELECTED EQUIPMENT ↗</button>';
 const bill=invoice
  ?'<div class="fz-visit-status '+(isPaid?"fz-paid":"")+'"><strong>'+esc(invoice.invoice_number)+'</strong><span>'+esc(isPaid?"PAID / CLOSED":"AWAITING CHECKOUT")+' · Total LKR '+amount(invoice.total_amount)+' · Paid LKR '+amount(invoice.amount_paid)+'</span></div>'
  :'<div class="fz-visit-grid"><label>SESSION CHARGE (LKR)<input id="visitSessionCharge" type="number" step=".01" min="1" value="'+(basePrice||"")+'"></label><p class="hint">Session charge is checked against the owner-set price. A private custom quote must first be set by the owner.</p></div>'+
    '<button type="button" class="primary" id="visitCreateInvoice">CREATE CUSTOMER INVOICE</button>';
 const addOns=!isPaid&&invoice
 ?'<div class="fz-visit-extras"><h4>ITEMISE THE FINAL BILL</h4><p class="hint">Keep the standard session charge; add optional rentals, retail items or other additional charges before payment.</p>'+
   '<div id="visitExtraRows"></div><button class="ghost" id="visitAddExtra" type="button">+ ADD EXTRA ITEM</button>'+
   '<label>BASE SESSION CHARGE (LKR)<input id="visitBaseCharge" type="number" step=".01" min="1" value="'+(basePrice||Number(lines[0]?.unit_price||invoice.total_amount))+'"></label>'+
   '<p id="visitBillPreview" class="fz-visit-subtotal">FINAL TOTAL: LKR '+amount(invoice.total_amount)+'</p>'+
   '<button class="primary fz-visit-wide" id="visitFinalize" type="button">FINALIZE BILL & ISSUE INVOICE</button></div>'
 :"";
 const payments=invoice&&!isPaid
 ?'<div class="fz-visit-pay"><h4>MARK INVOICE AS PAID</h4><p class="hint">Only press Paid after receiving and verifying the full balance. This records the payment and closes the invoice.</p>'+
   '<div class="fz-visit-grid"><label>PAYMENT METHOD<select id="visitPayMethod"><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="card">Card</option><option value="online">Online</option><option value="other">Other</option></select></label>'+
   '<label>RECEIVING ACCOUNT<select id="visitAccount">'+accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.account_name)+'</option>').join("")+'</select></label></div>'+
   '<label>RECEIPT / REFERENCE<input id="visitPayReference" placeholder="Bank reference, optional"></label>'+
   '<p class="fz-visit-due">BALANCE DUE <strong>LKR '+amount(invoice.balance_due)+'</strong></p>'+
   '<button class="primary fz-visit-wide" id="visitMarkPaid" type="button" '+(!accounts.length||!booking.checkout_finalized_at?"disabled":"")+
   '>PAID — RECORD VERIFIED BALANCE & CLOSE INVOICE</button>'+
   (!booking.checkout_finalized_at?'<p class="hint">Finalize the bill above first to enable payment.</p>':"")+'</div>'
 :"";
 panel.innerHTML='<p class="kicker">CUSTOMER ARRIVAL / '+esc(booking.booking_reference||"")+'</p>'+
  '<h3>FIELD VISIT & FINAL CHECKOUT</h3>'+
  '<div class="fz-visit-steps"><span class="'+(game?"done":"now")+'">01 CHECK IN</span><span class="'+(invoice?"done":"")+'">02 BILL</span><span class="'+(isPaid?"done":"")+'">03 PAID</span><span>04 SHARE</span></div>'+
  '<div class="fz-visit-section"><h4>01 / PLAYERS & GEAR</h4>'+details+'</div>'+
  '<div class="fz-visit-section"><h4>02 / CUSTOMER INVOICE</h4>'+bill+addOns+'</div>'+
  '<div class="fz-visit-section"><h4>03 / PAYMENT & CLOSURE</h4>'+(isPaid?'<p class="fz-visit-paid-banner">✓ INVOICE FULLY PAID · CLOSED FOR EDITING</p>':payments||'<p class="hint">Create and finalize the invoice to collect payment.</p>')+'</div>'+
  (invoice?'<div class="fz-visit-section"><h4>04 / SEND THE INVOICE</h4><p class="hint">On supported mobile devices, choose WhatsApp from the file share sheet to send the PDF. Otherwise, download the PDF and attach it in WhatsApp yourself.</p><div class="button-row"><button type="button" class="ghost" id="visitPdf">DOWNLOAD PDF</button><button type="button" class="primary" id="visitShare">SHARE INVOICE / WHATSAPP ↗</button></div><p class="hint">'+(isPaid?"PAID invoice":"Unpaid invoice / balance due")+" · "+receipts.length+" recorded receipt(s)</p></div>':"")+
  '<p id="visitStatus" role="status" class="message"></p>';
 const busy=async(fn,button)=>{
  if(button){button.disabled=true;button.textContent="PROCESSING…";}
  notify(panel,"Saving…");
  try{await fn();notify(panel,"Saved. Inventory and payment records updated.");await afterChange();}
  catch(e){notify(panel,e.message||"Could not save. Try again.",true);if(button){button.disabled=false;button.textContent=button.dataset.label||"TRY AGAIN";}}
 };
 const bind=(selector,fn)=>{const el=panel.querySelector(selector);if(el){el.dataset.label=el.textContent;el.onclick=()=>busy(fn,el);}};
 bind("#visitCheckin",async()=>{
  const players=Number(panel.querySelector("#visitPlayers").value);
  if(!Number.isInteger(players)||players<1||players>100)throw Error("Enter a valid player count");
  const issueLines=[...panel.querySelectorAll("[data-visit-stock]")].map(el=>({item_id:el.dataset.visitStock,quantity:Number(el.value)})).filter(x=>x.quantity>0);
  for(const x of issueLines){
   const i=stock.find(z=>z.id===x.item_id);
   if(!Number.isFinite(x.quantity)||x.quantity>available(i)||(i.kind==="reusable"&&!Number.isInteger(x.quantity)))
    throw Error("Check issued quantities for "+i.name);
  }
  await api("fz_staff_checkin_bundle",{p_booking_id:booking.id,p_actual_players:players,p_issue_lines:issueLines,p_notes:panel.querySelector("#visitCheckinNote").value||""});
 });
 bind("#visitExtraIssue",async()=>{
  if(!game||game.status!=="open")throw Error("Game is closed");
  const id=panel.querySelector("#visitExtraItem").value,qty=Number(panel.querySelector("#visitExtraQty").value);
  if(!id||qty<=0)throw Error("Select an item and quantity");
  await api("fz_staff_issue_item",{p_session_id:game.id,p_item_id:id,p_quantity:qty,p_notes:"Additional session issue"});
 });
 bind("#visitFinish",async()=>{
  if(!panel.querySelector("#visitReturnVerified")?.checked)throw Error("Physically collect and verify all reusable gear first");
  if(!confirm("Confirm you physically counted all returnable equipment for this game?"))throw Error("Finish cancelled");
  await api("fz_staff_finish_visit",{p_session_id:game.id,p_returns_verified:true,p_notes:panel.querySelector("#visitFinishNote").value||""});
 });
 bind("#visitCreateInvoice",async()=>{
  const charge=Number(panel.querySelector("#visitSessionCharge")?.value);
  if(!(charge>0))throw Error("Enter the owner-approved session price");
  await api("fz_staff_create_arrival_invoice",{p_booking_id:booking.id,p_total_amount:charge});
 });
 const extraHost=panel.querySelector("#visitExtraRows");
 let savedExtras=[];
 if(invoice&&Number(booking.checkout_finalized_at||0)!==0 && lines.length>1){
  savedExtras=lines.slice(1).map(x=>({description:x.description,quantity:Number(x.quantity),unit_price:Number(x.unit_price)}));
 }
 function row(extra){
  if(!extraHost)return;
  const el=document.createElement("div");el.className="fz-extra-line";
  el.innerHTML='<label>EXTRA ITEM / SERVICE<input class="fz-extra-name" maxlength="120" required placeholder="Extra gel balls / additional rental"></label>'+
   '<label>QTY<input class="fz-extra-qty" type="number" min="1" step=".01" value="'+esc(extra?.quantity||1)+'"></label>'+
   '<label>UNIT PRICE (LKR)<input class="fz-extra-price" type="number" min="0" step=".01" value="'+esc(extra?.unit_price??0)+'"></label>'+
   '<button class="ghost" type="button" aria-label="Remove extra item">REMOVE</button>';
  el.querySelector(".fz-extra-name").value=extra?.description||"";
  el.querySelector("button").onclick=()=>{el.remove();preview();};
  extraHost.append(el);
  el.querySelectorAll("input").forEach(n=>n.addEventListener("input",preview));
 }
 function getLines(){
  const base=Number(panel.querySelector("#visitBaseCharge")?.value);
  const all=[{description:(booking.experience||"FIELDZERO Game")+" / "+(booking.booking_reference||""),
    quantity:1,unit_price:base}];
  extraHost?.querySelectorAll(".fz-extra-line").forEach(el=>{
   const name=el.querySelector(".fz-extra-name").value.trim(),
    quantity=Number(el.querySelector(".fz-extra-qty").value),
    unit_price=Number(el.querySelector(".fz-extra-price").value);
   if(name||quantity>0&&unit_price>0)all.push({description:name,quantity,unit_price});
  });
  return all;
 }
 function preview(){
  const lines=getLines(),n=lines.reduce((s,x)=>s+Number(x.quantity)*Number(x.unit_price),0);
  const el=panel.querySelector("#visitBillPreview");if(el)el.textContent="FINAL TOTAL: LKR "+amount(n);
 }
 if(extraHost){savedExtras.forEach(row);
  panel.querySelector("#visitAddExtra").onclick=()=>row(null);
  panel.querySelector("#visitBaseCharge")?.addEventListener("input",preview);preview();
 }
 bind("#visitFinalize",async()=>{
  const entries=getLines();
  if(entries.some(x=>x.description.length<2||!Number.isFinite(x.unit_price)||x.unit_price<0||!Number.isFinite(x.quantity)||x.quantity<=0))
   throw Error("Every invoice item needs a description, positive quantity and valid price");
  if(!Number.isFinite(entries[0].unit_price)||entries[0].unit_price<=0)throw Error("Base charge must be greater than zero");
  await api("fz_staff_finalize_bill",{p_booking_id:booking.id,p_items:entries,p_discount_amount:0,p_tax_rate:0});
 });
 bind("#visitMarkPaid",async()=>{
  if(!booking.checkout_finalized_at)throw Error("Finalize the invoice first");
  if(!invoice||Number(invoice.balance_due)<=0)throw Error("Invoice is already fully paid");
  const account=panel.querySelector("#visitAccount")?.value||null,method=panel.querySelector("#visitPayMethod")?.value;
  if(!account)throw Error("Choose a receiving account");
  if(!confirm("Has FIELDZERO actually received LKR "+amount(invoice.balance_due)+"? This permanently records the payment and closes the invoice."))throw Error("Payment cancelled");
  await api("fz_staff_record_payment",{p_invoice_id:invoice.id,p_amount:Number(invoice.balance_due),p_payment_date:localDate(),
   p_payment_method:method,p_account_id:account,p_reference:panel.querySelector("#visitPayReference")?.value.trim()||"",
   p_received_by:(await db.auth.getUser()).data.user?.email||"Field worker",p_request_key:crypto.randomUUID()});
 });
 function documentPDF(){
  const J=window.jspdf?.jsPDF;if(!J)throw Error("PDF generator is unavailable");
  const doc=new J();doc.setFillColor(13,27,20);doc.rect(0,0,210,45,"F");
  doc.setTextColor(205,236,139);doc.setFontSize(27);doc.setFont("helvetica","bold");doc.text("FIELDZERO",14,23);
  doc.setFontSize(9);doc.text("FIELD OPERATIONS   /   OFFICIAL CUSTOMER INVOICE",14,34);
  doc.setTextColor(28,37,29);doc.setFontSize(11);doc.text(invoice.invoice_number,14,59);
  doc.text("BOOKING  "+(booking.booking_reference||""),14,67);
  doc.text("CUSTOMER  "+String(booking.real_name||"").slice(0,55),14,75);
  doc.text("DATE  "+String(invoice.invoice_date||localDate()),14,83);
  let y=101;
  doc.setFontSize(10);doc.setFont("helvetica","bold");doc.text("DESCRIPTION",14,y);doc.text("AMOUNT (LKR)",161,y);y+=8;
  doc.setFont("helvetica","normal");doc.setFontSize(9);
  for(const x of lines){
   const desc=doc.splitTextToSize(String(x.description||"").slice(0,150),126);
   if(y+desc.length*5>248){doc.addPage();y=25;}
   doc.text(desc,14,y);doc.text(amount(x.line_total),164,y);y+=Math.max(8,desc.length*5+3);
  }
  y+=8;if(y>248){doc.addPage();y=25;}
  doc.setFont("helvetica","bold");doc.setFontSize(11);
  doc.text("TOTAL    LKR "+amount(invoice.total_amount),14,y);y+=8;
  doc.text("RECEIVED    LKR "+amount(invoice.amount_paid),14,y);y+=8;
  doc.text("BALANCE    LKR "+amount(invoice.balance_due),14,y);y+=11;
  doc.setTextColor(isPaid?34:140,isPaid?108:80,isPaid?45:42);
  doc.text(isPaid?"PAID  /  CLOSED":"AWAITING FINAL PAYMENT",14,y);
  doc.setTextColor(28,37,29);doc.setFontSize(8);doc.setFont("helvetica","normal");
  doc.text("Payments are valid only after verification by FIELDZERO staff.",14,278);
  return doc;
 }
 const pdfBtn=panel.querySelector("#visitPdf"),shareBtn=panel.querySelector("#visitShare");
 if(pdfBtn)pdfBtn.onclick=()=>{try{documentPDF().save((invoice.invoice_number||"FZ-INVOICE")+".pdf");}
  catch(e){notify(panel,e.message,true);}};
 if(shareBtn)shareBtn.onclick=async()=>{
  try{
   const doc=documentPDF(),file=new File([doc.output("blob")],(invoice.invoice_number||"FZ-INVOICE")+".pdf",{type:"application/pdf"});
   const mobile=String(booking.mobile||"").replace(/\D/g,"").replace(/^0/,"94");
   const text="FIELDZERO INVOICE "+invoice.invoice_number+"\nBooking "+(booking.booking_reference||"")+
    "\nTotal LKR "+amount(invoice.total_amount)+"\nBalance LKR "+amount(invoice.balance_due)+
    (isPaid?"\nPAID IN FULL":"\nPayment pending");
   if(navigator.canShare?.({files:[file]}) && navigator.share){
    await navigator.share({files:[file],title:"FIELDZERO Invoice",text});
    notify(panel,"Share sheet opened. Choose WhatsApp and confirm delivery.");
   }else{
    doc.save(file.name);
    if(/^94\d{9}$/.test(mobile))window.open("https://wa.me/"+mobile+"?text="+encodeURIComponent(text)," _blank".trim(),"noopener,noreferrer");
    notify(panel,"Invoice PDF downloaded. Attach that PDF to the WhatsApp conversation; it was not automatically delivered.");
   }
  }catch(e){if(e.name!=="AbortError")notify(panel,e.message||"Invoice sharing failed",true);}
 };
}
window.FZVisitV25={render};
})();
