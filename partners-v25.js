
(()=>{
"use strict";const cfg=window.FIELDZERO_CONFIG||{},db=window.supabase?.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
document.querySelectorAll("[data-type]").forEach(link=>link.addEventListener("click",()=>{
 const chosen=document.querySelector("#partnerType");if(chosen)chosen.value=link.dataset.type;
}));
document.querySelector("#partnerForm")?.addEventListener("submit",async e=>{
 e.preventDefault();const f=new FormData(e.currentTarget),btn=document.querySelector("#partnerSubmit"),out=document.querySelector("#partnerStatus");
 if(!db){out.textContent="Enquiries are temporarily unavailable.";return;}
 btn.disabled=true;btn.textContent="SUBMITTING…";out.textContent="";
 const row={inquiry_type:String(f.get("inquiry_type")),organization:String(f.get("organization")||"").trim(),
 contact_name:String(f.get("contact_name")||"").trim(),email:String(f.get("email")||"").trim(),
 mobile:String(f.get("mobile")||"").trim(),message:String(f.get("message")||"").trim(),consent:f.get("consent")==="on",status:"new"};
 const {error}=await db.from("fz_partner_leads").insert(row);
 btn.disabled=false;btn.textContent="SEND PARTNERSHIP ENQUIRY ↗";
 if(error){out.textContent="Unable to submit: "+error.message;return;}
 out.textContent="Enquiry received. FIELDZERO will review your proposal and contact you using the details provided.";
 e.currentTarget.reset();
});
})();
