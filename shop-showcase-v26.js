
/* FIELDZERO SUPPLY FLAGSHIP V26 / promotional preview and category navigation
   A first-party visual layer around the existing owner-published product catalogue. */
(()=>{
"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const promo=$("#fz26PromoScreen"),closeButton=$("#fz26PromoClose");
const link=$("#fz26PromoExplore"),title=$("#fz26PromoTitle");
const summary=$("#fz26PromoDescription");
const dismiss=$("#fz26PromoDismiss");
let lastFocused=null,seen=false;
const marker="fz26_supply_promo_seen";
try{seen=sessionStorage.getItem(marker)==="true";}catch(_){}
function closePromo(){
 if(!promo||promo.hidden)return;
 promo.hidden=true;
 document.body.classList.remove("fz26-promo-open");
 const openOverlay=$(".supply-overlay:not([hidden])");
 if(!openOverlay)document.body.classList.remove("supply-lock");
 lastFocused?.focus?.({preventScroll:true});
}
function openPromo(){
 if(!promo||!promo.hidden||seen)return;
 if($(".supply-overlay:not([hidden])"))return;
 lastFocused=document.activeElement;
 promo.hidden=false;
 document.body.classList.add("fz26-promo-open","supply-lock");
 seen=true;
 try{sessionStorage.setItem(marker,"true");}catch(_){}
 closeButton?.focus({preventScroll:true});
}
closeButton?.addEventListener("click",closePromo);
dismiss?.addEventListener("click",closePromo);
$("[data-fz26-close-promo]")?.addEventListener("click",closePromo);
link?.addEventListener("click",()=>{closePromo();});
document.addEventListener("keydown",e=>{
 if(!promo||promo.hidden)return;
 if(e.key==="Escape"){
   e.preventDefault();e.stopImmediatePropagation();closePromo();return;
 }
 if(e.key==="Tab"){
  const controls=[...promo.querySelectorAll("button:not([disabled]),a[href]")].filter(x=>x.offsetParent!==null);
  if(!controls.length)return;
  const first=controls[0],last=controls[controls.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
},true);

// Never invent a price, product promotion or offer.
// The display upgrades only when a real, published FIELDZERO item is available.
window.addEventListener("fz:supply:catalogue",event=>{
 const products=Array.isArray(event.detail?.products)?event.detail.products:[];
 const featured=products.find(p=>p.featured&&p.published&&p.stock_qty>0);
 const availability=products.filter(p=>p.published);
 if(!summary||!title)return;
 if(featured){
   summary.textContent="Discover "+featured.title+" and browse FIELDZERO's verified collection of sporting gel blasters, safety gear and field essentials.";
   const label=$("#fz26PromoFeatured");
   if(label){
     label.hidden=false;
     label.querySelector("b").textContent="FEATURED IN SUPPLY";
     label.querySelector("span").textContent=featured.title+" / LKR "+Number(featured.price_lkr).toLocaleString("en-LK");
   }
 }else if(availability.length){
   summary.textContent="Explore "+availability.length+" published FIELDZERO supply items, including sporting gear and protective equipment. Availability confirmed before purchase.";
 }else{
   summary.textContent="FIELDZERO's sporting gear catalogue is coming. Explore the collection, reserve a field session, and discover the equipment categories.";
 }
});
$$("[data-featured-cat]").forEach(tile=>{
 tile.addEventListener("click",()=>{
   const filter=tile.dataset.featuredCat||"all";
   const term=tile.dataset.featuredSearch||"";
   const target=$('#categoryFilters [data-cat="'+filter+'"]');
   const input=$("#productSearch");
   if(input){
    input.value=term;
    input.dispatchEvent(new Event("input",{bubbles:true}));
   }
   target?.click();
   $("#catalog")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
   const selected=tile.querySelector(".fz26-category-name")?.textContent?.trim()||filter;
   $("#productCount")?.setAttribute("aria-label","Showing "+selected+" equipment");
 });
});
// Show once per browser session, never continuously obstruct returning visitors.
if(!seen)window.setTimeout(()=>{
 if(document.visibilityState==="visible")openPromo();
},1300);
window.addEventListener("pageshow",()=>{if(!seen&&document.visibilityState==="visible")openPromo();},{once:true});
})();
