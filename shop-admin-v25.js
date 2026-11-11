
/* FIELDZERO Supply owner dashboard / V25 */
(()=>{
"use strict";
const cfg=window.FIELDZERO_CONFIG||{},db=window.supabase?.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>"LKR "+Number(v||0).toLocaleString("en-LK",{maximumFractionDigits:2});
const dt=v=>v?new Date(v).toLocaleString("en-LK",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Colombo"}):"—";
let products=[],orders=[],leads=[];
const notice=(s,bad=false)=>{const el=$("#shopAdminStatus");el.textContent=s;el.classList.toggle("error",bad);};
async function rpc(fn,args){const {data,error}=await db.rpc(fn,args);if(error)throw Error(error.message);return data;}
async function refresh(){
 const rs=await Promise.all([
  db.from("fz_shop_products").select("*").order("created_at",{ascending:false}),
  db.from("fz_shop_orders").select("*,fz_shop_order_items(*)").order("created_at",{ascending:false}).limit(120),
  db.from("fz_partner_leads").select("*").order("created_at",{ascending:false}).limit(120)
 ]);
 const err=rs.find(x=>x.error);if(err){notice(err.error.message,true);return;}
 products=rs[0].data||[];orders=rs[1].data||[];leads=rs[2].data||[];
 $("#shopAdminMetrics").innerHTML=[
  ["TOTAL PRODUCTS",products.length],["PUBLIC PRODUCTS",products.filter(x=>x.published).length],
  ["PENDING ENQUIRIES",orders.filter(x=>x.status==="pending").length],["PARTNER LEADS",leads.length]
 ].map(([name,val])=>'<div class="metric"><strong>'+val+'</strong><small>'+name+'</small></div>').join("");
 drawProducts();drawOrders();drawLeads();
}
function drawProducts(){
 $("#ownerProductList").innerHTML=products.length?products.map(p=>
 '<article class="record supply-owner-item"><div class="shop-owner-photo">'+(p.image_url?'<img src="'+esc(p.image_url)+'" alt="">':'<span>FZ</span>')+'</div>'+
 '<div><b>'+esc(p.title)+'</b><small>'+esc(p.sku)+' · '+esc(p.category)+'</small><small>'+money(p.price_lkr)+' · '+Number(p.stock_qty)+' in retail stock</small>'+
 '<div class="meta"><span class="pill">'+(p.published?"PUBLISHED":"DRAFT")+'</span><button class="ghost" data-shop-edit="'+esc(p.id)+'">EDIT</button></div></div></article>').join("")
 :'<div class="panel"><p>No products. Use the form to add your first FIELDZERO retail listing.</p></div>';
 $$("[data-shop-edit]").forEach(b=>b.onclick=()=>editProduct(b.dataset.shopEdit));
}
function editProduct(id){
 const p=products.find(x=>x.id===id);if(!p)return;
 const form=$("#productAdminForm");
 for(const k of ["id","sku","title","category","price_lkr","stock_qty","short_description","details","image_url","status_label"]){
  const el=form.elements.namedItem(k);if(el)el.value=p[k]??"";
 }
 form.elements.namedItem("featured").checked=!!p.featured;
 form.elements.namedItem("published").checked=!!p.published;
 $("#shopImageFile").value="";
 form.scrollIntoView({behavior:"smooth",block:"start"});
 notice("Editing "+p.sku+". Save to publish changes.");
}
function drawOrders(){
 $("#ownerOrderList").innerHTML=orders.length?orders.map(o=>{
 const lines=(o.fz_shop_order_items||[]).map(x=>esc(x.title_snapshot)+" × "+x.quantity+" — "+money(x.line_total_lkr)).join("<br>");
 const number=String(o.mobile||"").replace(/\D/g,"").replace(/^0/,"94");
 const wa=/^94\d{9}$/.test(number)?"https://wa.me/"+number+"?text="+encodeURIComponent("Hello from FIELDZERO Supply. Your enquiry reference "+o.reference+". We are following up on your gear request."):"";
 return '<article class="record"><div class="shop-owner-order-head"><div><b>'+esc(o.reference)+' / '+esc(o.customer_name)+'</b><small>'+dt(o.created_at)+' · '+esc(o.mobile)+' · '+esc(o.email||"No email")+'</small></div><span class="pill">'+esc(o.status)+'</span></div>'+
 '<p class="shop-order-lines">'+lines+'</p><p class="shop-owner-total">'+money(o.total_lkr)+'</p><p class="hint">'+esc(o.notes||"")+'</p>'+
 '<div class="button-row">'+(wa?'<a class="ghost shop-owner-link" target="_blank" rel="noopener noreferrer" href="'+esc(wa)+'">OPEN CUSTOMER WHATSAPP ↗</a>':"")+
 (o.status==="pending"?'<button class="primary" data-shop-action="confirmed" data-id="'+esc(o.id)+'">CONFIRM ORDER</button><button class="danger" data-shop-action="cancelled" data-id="'+esc(o.id)+'">CANCEL</button>':"")+
 (o.status==="confirmed"?'<button class="primary" data-shop-action="fulfilled" data-id="'+esc(o.id)+'">PAYMENT VERIFIED · FULFILL & DEDUCT STOCK</button><button class="danger" data-shop-action="cancelled" data-id="'+esc(o.id)+'">CANCEL</button>':"")+'</div></article>';
 }).join(""):'<div class="panel">No retail enquiries have been received.</div>';
 $$("[data-shop-action]").forEach(btn=>btn.onclick=async()=>{
 const action=btn.dataset.shopAction;
 if(action==="fulfilled"&&!confirm("Have you verified payment and handed over the correct items? Stock will be deducted."))return;
 if(action==="cancelled"&&!confirm("Cancel this customer enquiry?"))return;
 btn.disabled=true;notice("Updating order…");
 try{await rpc("fz_owner_review_shop_order",{p_order_id:btn.dataset.id,p_status:action});notice("Order "+action+".");await refresh();}
 catch(e){notice(e.message,true);btn.disabled=false;}
 });
}
function drawLeads(){
 $("#ownerPartnerList").innerHTML=leads.length?leads.map(l=>
 '<article class="record"><span class="pill">'+esc(l.inquiry_type)+'</span><b style="margin-top:10px">'+esc(l.organization)+'</b>'+
 '<small>'+dt(l.created_at)+' / '+esc(l.contact_name)+' / '+esc(l.email)+' / '+esc(l.mobile||"")+'</small>'+
 '<p class="shop-order-lines">'+esc(l.message)+'</p><div class="button-row"><a class="ghost shop-owner-link" href="mailto:'+encodeURIComponent(l.email)+'?subject='+encodeURIComponent("FIELDZERO Partnership / "+l.organization)+'">REPLY BY EMAIL ↗</a></div></article>').join("")
 :'<div class="panel">No partner or sponsor enquiries yet.</div>';
}
async function initialize(){
 const {data:{user},error}=await db.auth.getUser();if(error||!user)return;
 const {data:isAdmin,error:roleError}=await db.rpc("is_fieldzero_admin");
 if(roleError||isAdmin!==true){$("#shopLoginStatus").textContent="Only FIELDZERO owner administrators can access Supply Control.";return;}
 $("#shopAdminLogin").hidden=true;$("#shopAdminWorkspace").hidden=false;$("#logout").hidden=false;
 $("#shopOwnerIdentity").textContent="OWNER / "+user.email;await refresh();
}
$("#shopLoginForm").onsubmit=async e=>{
 e.preventDefault();const f=new FormData(e.currentTarget);$("#shopLoginStatus").textContent="Signing in…";
 const {error}=await db.auth.signInWithPassword({email:String(f.get("email")),password:String(f.get("password"))});
 if(error){$("#shopLoginStatus").textContent=error.message;return;}
 try{await initialize();}catch(err){$("#shopLoginStatus").textContent=err.message;}
};
$("#logout").onclick=async()=>{await db.auth.signOut();location.reload();};
$("#shopRefresh").onclick=refresh;
$$("[data-store-tab]").forEach(b=>b.onclick=()=>{
 $$("[data-store-tab]").forEach(x=>x.classList.toggle("active",x===b));
 $$("[data-store-panel]").forEach(x=>x.hidden=x.dataset.storePanel!==b.dataset.storeTab);
});
$("#resetProduct").onclick=()=>{$("#productAdminForm").reset();$("#productAdminForm [name=id]").value="";notice("New product form ready.");};
$("#productAdminForm").onsubmit=async e=>{
 e.preventDefault();const form=e.currentTarget,f=new FormData(form),submit=form.querySelector('button[type="submit"]');
 const product={id:f.get("id")||null,sku:String(f.get("sku")).trim(),title:String(f.get("title")).trim(),
  category:String(f.get("category")).trim(),price_lkr:Number(f.get("price_lkr")),
  stock_qty:Number(f.get("stock_qty")),short_description:String(f.get("short_description")||""),
  details:String(f.get("details")||""),image_url:String(f.get("image_url")||"").trim(),
  status_label:String(f.get("status_label")||"IN STOCK"),featured:f.get("featured")==="on",
  published:f.get("published")==="on"};
 if(!Number.isInteger(product.stock_qty)||product.stock_qty<0){notice("Retail stock must be a whole number.",true);return;}
 submit.disabled=true;notice("Saving product…");
 try{
  const file=$("#shopImageFile").files?.[0];
  if(file){
   if(file.size>5*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Choose a JPG, PNG or WEBP up to 5 MB.");
   const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
   const path="catalog/"+crypto.randomUUID()+"."+ext;
   const {error}=await db.storage.from("fz-shop-images").upload(path,file,{contentType:file.type,upsert:false});
   if(error)throw Error("Image upload failed: "+error.message);
   product.image_url=db.storage.from("fz-shop-images").getPublicUrl(path).data.publicUrl;
  }
  await rpc("fz_owner_upsert_shop_product",{p_product:product});
  form.reset();form.elements.namedItem("id").value="";notice("Product saved. Public shop displays it only when Published is enabled.");
  await refresh();
 }catch(err){notice(err.message||String(err),true);}
 finally{submit.disabled=false;}
};
db.auth.getSession().then(({data:{session}})=>{if(session)initialize().catch(err=>notice(err.message,true));});
})();
