
/* FIELDZERO Supply — public catalogue, quick view and no-payment order requests */
(()=>{
"use strict";
const cfg=window.FIELDZERO_CONFIG||{};
const db=window.supabase?.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const price=n=>"LKR "+Number(n||0).toLocaleString("en-LK",{maximumFractionDigits:2});
let products=[],cart=new Map(),category="all";
function cat(p){
 const v=(p.category+" "+p.title).toLowerCase();
 if(/safety|mask|goggle|eye|protect|vest/.test(v))return "safety";
 if(/gel ball|gel bead|ammunit|gel ammo/.test(v))return "ammo";
 if(/accessor|battery|charger|target|bag|strap|scope|attachment/.test(v))return "accessory";
 return "gel";
}
function productPhoto(p){
 if(/^https:\/\//.test(p.image_url||""))
  return '<img loading="lazy" src="'+esc(p.image_url)+'" alt="'+esc(p.title)+'">';
 return '<div class="supply-placeholder"><span class="supply-placeholder-cross">+</span><span>FIELDZERO<small>SUPPLY / GEAR</small></span><b>F/Z</b></div>';
}
function display(){
 const term=$("#productSearch").value.trim().toLowerCase();
 const found=products.filter(p=>(category==="all"||cat(p)===category)&&(!term||(p.title+" "+p.category+" "+p.sku).toLowerCase().includes(term)));
 $("#productCount").textContent=(found.length?found.length+" ITEMS":"0 ITEMS")+" / CURRENT FIELDZERO COLLECTION";
 if(!products.length){
  $("#productsGrid").innerHTML='<div class="supply-empty-catalogue"><span class="supply-small">FIELDZERO / SUPPLY INDEX 000</span>'+
   '<h3>THE COLLECTION<br><em>IS COMING.</em></h3><p>The shop is prepared for our first owner-approved product listings. No products, stock counts or prices have been invented.</p>'+
   '<div class="supply-empty-categories"><span>GEL BLASTERS</span><span>GEL BALLS</span><span>PROTECTIVE GEAR</span><span>ACCESSORIES</span></div>'+
   '<a href="index.html#calendar" class="supply-button primary">BOOK A FIELD SESSION ↗</a></div>';
  return;
 }
 $("#productsGrid").innerHTML=found.length?found.map(p=>
  '<article class="supply-product"><button class="supply-product-image" type="button" data-quick="'+esc(p.id)+'" aria-label="Open '+esc(p.title)+'">'+productPhoto(p)+
  '<span class="supply-quick-action">QUICK VIEW ↗</span></button>'+
  '<div class="supply-product-info"><span class="supply-product-category">'+esc(p.category)+' · '+esc(p.sku)+'</span>'+
  '<h3>'+esc(p.title)+'</h3><p>'+esc(p.short_description||"Equipment from the FIELDZERO collection")+'</p>'+
  '<div class="supply-product-bottom"><div><strong>'+price(p.price_lkr)+'</strong><small>'+(
    p.stock_qty>0?esc(p.status_label||"AVAILABLE")+" · "+Number(p.stock_qty)+" IN STOCK":"OUT OF STOCK"
  )+'</small></div><button type="button" data-add="'+esc(p.id)+'" '+(p.stock_qty>0?"":"disabled")+
  ' aria-label="Add '+esc(p.title)+' to enquiry bag">+</button></div></div></article>').join("")
 :'<div class="supply-empty-catalogue"><h3>NO MATCHES.</h3><p>Try a different item or category.</p></div>';
 $$("[data-quick]").forEach(btn=>btn.onclick=()=>quick(btn.dataset.quick));
 $$("[data-add]").forEach(btn=>btn.onclick=()=>add(btn.dataset.add));
}
function add(id){
 const p=products.find(x=>x.id===id);if(!p||p.stock_qty<=0)return;
 const qty=Math.min(p.stock_qty,(cart.get(id)||0)+1);
 cart.set(id,qty);syncCart();
 const btn=$("[data-add='"+CSS.escape(id)+"']");
 if(btn){btn.textContent="✓";setTimeout(()=>{if(btn.isConnected)btn.textContent="+";},800);}
}
function syncCart(){
 let count=0,sum=0;for(const [id,n] of cart){const p=products.find(x=>x.id===id);if(!p){cart.delete(id);continue;}const qty=Math.min(n,p.stock_qty);if(qty<=0){cart.delete(id);continue;}cart.set(id,qty);count+=qty;sum+=qty*p.price_lkr;}
 $("#cartCount").textContent=count;$("#cartTotal").textContent=price(sum);
 const host=$("#cartItems");
 if(!cart.size){host.innerHTML='<div class="supply-cart-empty">YOUR ENQUIRY BAG IS EMPTY.<br><small>Explore products and add your preferred gear.</small></div>';return;}
 host.innerHTML=[...cart].map(([id,qty])=>{
  const p=products.find(x=>x.id===id);if(!p)return"";
  return '<article class="supply-cart-row"><div class="supply-cart-thumb">'+productPhoto(p)+'</div><div><b>'+esc(p.title)+'</b><small>'+price(p.price_lkr)+' / UNIT</small>'+
  '<div class="supply-qty-controls"><button data-decrease="'+esc(id)+'" aria-label="Reduce quantity">−</button><span>'+qty+'</span>'+
  '<button data-increase="'+esc(id)+'" aria-label="Increase quantity">+</button><button data-remove="'+esc(id)+'" aria-label="Remove item">REMOVE</button></div></div></article>';
 }).join("");
 $$("[data-decrease]").forEach(btn=>btn.onclick=()=>{const n=cart.get(btn.dataset.decrease)||0;if(n<=1)cart.delete(btn.dataset.decrease);else cart.set(btn.dataset.decrease,n-1);syncCart();});
 $$("[data-increase]").forEach(btn=>btn.onclick=()=>{const p=products.find(x=>x.id===btn.dataset.increase);cart.set(p.id,Math.min(p.stock_qty,(cart.get(p.id)||0)+1));syncCart();});
 $$("[data-remove]").forEach(btn=>btn.onclick=()=>{cart.delete(btn.dataset.remove);syncCart();});
}
function open(id){
 $(id).hidden=false;document.body.classList.add("supply-lock");
 $(id+" .supply-close")?.focus();
}
function close(id){
 $(id).hidden=true;if($("#productOverlay").hidden&&$("#cartOverlay").hidden)document.body.classList.remove("supply-lock");
}
function quick(id){
 const p=products.find(x=>x.id===id);if(!p)return;
 $("#quickBody").innerHTML='<div class="supply-quick-grid"><div class="supply-quick-image">'+productPhoto(p)+'</div>'+
  '<div class="supply-quick-copy"><span class="supply-small">FIELDZERO PRODUCT / '+esc(p.sku)+'</span>'+
  '<h2 id="quickTitle">'+esc(p.title)+'</h2><span class="supply-quick-category">'+esc(p.category)+'</span>'+
  '<p>'+esc(p.short_description||"FIELDZERO sporting equipment")+'</p>'+
  '<p class="supply-quick-details">'+esc(p.details||"Contact FIELDZERO for full product details, compatibility and availability.")+'</p>'+
  '<div class="supply-quick-cost">'+price(p.price_lkr)+'</div><p class="supply-stock-badge">'+
  (p.stock_qty>0?esc(p.status_label)+" · "+p.stock_qty+" available":"OUT OF STOCK")+'</p>'+
  '<button class="supply-button primary wide" id="quickAdd" '+(!p.stock_qty?"disabled":"")+' type="button">ADD TO ENQUIRY BAG +</button>'+
  '<small>Customer enquiries are not payment orders. Availability is confirmed before any sale.</small></div></div>';
 $("#quickAdd").onclick=()=>{add(id);close("#productOverlay");open("#cartOverlay");};
 open("#productOverlay");
}
$("#openCart").onclick=()=>{syncCart();open("#cartOverlay");};
$("#closeCart").onclick=()=>close("#cartOverlay");
$("#closeQuick").onclick=()=>close("#productOverlay");
$$("[data-close]").forEach(el=>el.onclick=()=>close(el.dataset.close==="cart"?"#cartOverlay":"#productOverlay"));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){close("#productOverlay");close("#cartOverlay");}});
$$("[data-cat]").forEach(button=>button.onclick=()=>{
 category=button.dataset.cat;$$("[data-cat]").forEach(b=>b.classList.toggle("selected",b===button));display();
});
$("#productSearch").addEventListener("input",display);
$("#shopRequestForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const form=e.currentTarget,submit=$("#submitShopOrder"),message=$("#shopRequestStatus");
 if(!cart.size){message.textContent="Add at least one item to your enquiry bag.";return;}
 const f=new FormData(form);
 if(f.get("consent")!=="on"){message.textContent="Please accept the contact notice.";return;}
 submit.disabled=true;submit.textContent="SUBMITTING REQUEST…";message.textContent="";
 const items=[...cart].map(([product_id,quantity])=>({product_id,quantity}));
 const {data,error}=await db.rpc("fz_submit_shop_order",{p_name:String(f.get("customer_name")||"").trim(),p_mobile:String(f.get("mobile")||"").trim(),
  p_email:String(f.get("email")||"").trim(),p_notes:String(f.get("notes")||"").trim(),p_items:items,p_consent:true});
 submit.disabled=false;submit.textContent="REQUEST AVAILABILITY ↗";
 if(error){message.textContent="Could not submit request: "+error.message;return;}
 message.innerHTML='<strong>REQUEST RECEIVED — '+esc(data)+'</strong><p>Save this enquiry reference. FIELDZERO will contact you about product availability and payment arrangements. No payment has been collected.</p>';
 cart.clear();syncCart();form.reset();
});
async function loadProducts(){
 if(!db){$("#productCount").textContent="CATALOGUE UNAVAILABLE";return;}
 const {data,error}=await db.from("fz_shop_products").select("id,sku,title,category,short_description,details,price_lkr,stock_qty,image_url,featured,published,status_label")
  .eq("published",true).order("featured",{ascending:false}).order("created_at",{ascending:false});
 if(error){$("#productsGrid").innerHTML='<div class="supply-empty-catalogue"><h3>COLLECTION UNAVAILABLE.</h3><p>Please retry or contact FIELDZERO.</p></div>';$("#productCount").textContent="CATALOGUE TEMPORARILY UNAVAILABLE";return;}
 products=data||[];display();syncCart();
}
loadProducts();
})();
