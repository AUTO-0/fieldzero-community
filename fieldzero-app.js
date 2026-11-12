/* FIELDZERO CUSTOMER APP / V28 — existing site and secure Supabase data */
(()=>{
"use strict";
const CFG=window.FIELDZERO_CONFIG||{}, db=window.supabase?.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>"LKR "+Number(n||0).toLocaleString("en-LK",{maximumFractionDigits:0});
const fmtDate=d=>new Date(d).toLocaleString("en-LK",{timeZone:"Asia/Colombo",dateStyle:"medium",timeStyle:"short"});
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const localDateTime=(date,time)=>new Date(date+"T"+time+":00+05:30");
const state={screen:"home",user:null,context:null,membership:null,bookings:[],fields:[],modes:[],squads:[],gamesFilter:"upcoming",siteSettings:null,slotsReq:0,authMode:"login"};
const msg=(el,value,type="")=>{if(!el)return;el.textContent=value;el.className="fz-message"+(type?" "+type:"");};
const toast=s=>{const el=$("#appToast");el.textContent=s;el.hidden=false;window.setTimeout(()=>el.hidden=true,3200);};
const online=()=>navigator.onLine!==false;
async function invoke(fn,args){const {data,error}=await db.rpc(fn,args);if(error)throw Error(error.message);return data;}
function showScreen(name){
 if(!["home","book","games","squads","profile","install"].includes(name))name="home";
 state.screen=name;
 $$("[data-screen]").forEach(el=>el.hidden=el.dataset.screen!==name);
 $$(".fz-app-bottomnav [data-nav]").forEach(btn=>{
  const on=btn.dataset.nav===name;
  btn.classList.toggle("active",on);
  if(on)btn.setAttribute("aria-current","page");else btn.removeAttribute("aria-current");
 });
 try{history.replaceState(null,"","#"+name);}catch(_){}
 window.scrollTo({top:0,behavior:"instant"});
 if(name==="games")renderBookings();
 if(name==="squads")renderSquads();
 if(name==="book")drawBookingAccess();
 if(name==="profile")renderProfile();
 if(name==="install")renderInstallHelp();
}
$$("[data-nav]").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.nav)));
window.addEventListener("hashchange",()=>{
 const page=location.hash.slice(1);
 if(["home","book","games","squads","profile","install"].includes(page)&&page!==state.screen)showScreen(page);
});
function setOffline(){
 const off=!online();$("#networkNotice").hidden=!off;
 $("#appBookSubmit").disabled=off;
 $("#appSlots").classList.toggle("is-offline",off);
}
window.addEventListener("online",()=>{setOffline();loadPublicData();if(state.user)refreshPersonalData();});
window.addEventListener("offline",setOffline);
setOffline();
if(!db){toast("Unable to connect to FIELDZERO. Check your connection.");return;}
const initialFromHash=location.hash.replace("#","");
showScreen(["home","book","games","squads","profile","install"].includes(initialFromHash)?initialFromHash:"home");

// All prices, game modes and locations originate from the existing FIELDZERO backend.
async function loadPublicData(){
 const [fields,modes,settings,squads]=await Promise.all([
  db.from("public_arena_fields").select("id,name,address,slug,is_main,booking_deposit_percent").order("name"),
  db.from("public_session_prices").select("package_key,package_name,price_amount,price_note,min_players,max_players,duration_minutes,venue_resource,mode_details,requestable,active").eq("active",true),
  db.from("public_site_settings").select("launch_date,opening_soon_enabled").eq("id",1).maybeSingle(),
  db.from("public_teams").select("id,name,points,team_rank,member_count").order("points",{ascending:false}).limit(100)
 ]);
 if(fields.error)toast("Field list unavailable");else state.fields=fields.data||[];
 if(modes.error)toast("Game modes unavailable");else state.modes=(modes.data||[]).filter(x=>x.requestable!==false && x.package_key!=="fieldzero-membership"&&x.package_key!=="birthday-private-event");
 state.siteSettings=settings.data||{launch_date:"2026-12-10"};
 state.squads=squads.data||[];
 const field=$("#appField"),selected=field.value;
 field.innerHTML=state.fields.length?state.fields.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join(""):'<option value="">No active fields available</option>';
 field.value=state.fields.some(f=>f.id===selected)?selected:(state.fields.find(x=>x.is_main)?.id||state.fields[0]?.id||"");
 const select=$("#appExperience"),prior=select.value;
 select.innerHTML='<option value="">SELECT GAME MODE</option>'+state.modes.map(x=>'<option value="'+esc(x.package_name)+'">'+esc(x.package_name)+'</option>').join("");
 if(state.modes.some(x=>x.package_name===prior))select.value=prior;
 const date=$("#appDate");
 date.min=state.fields.find(f=>f.id===field.value)?.is_main&&String(state.siteSettings?.launch_date||"2026-12-10")>today()?String(state.siteSettings.launch_date):today();
 if(!date.value||date.value<date.min)date.value=date.min;
 const launch=String(state.siteSettings?.launch_date||"2026-12-10");
 if(today()>=launch){
  $(".fz-info-bar").innerHTML='<span class="fz-badge-dot"></span> CURRENT SESSION TERMS APPLY · ADVANCE MAY BE REQUIRED';
 }
 modeChange();renderSquads();
}
const currentMode=()=>state.modes.find(m=>m.package_name===$("#appExperience").value);
function modeChange(){
 const m=currentMode(),special=$("#appSpecial").value==="true";
 const select=$("#appPlayers"),previous=Number(select.value)||1;
 const mn=Math.max(1,Math.min(16,Number(m?.min_players??1))),mx=Math.max(mn,Math.min(16,Number(m?.max_players??16)));
 select.innerHTML=Array.from({length:mx-mn+1},(_,i)=>{
  const n=mn+i;return '<option value="'+n+'">'+n+' player'+(n===1?"":"s")+'</option>';
 }).join("");
 select.value=String(Math.max(mn,Math.min(mx,previous)));
 const info=$("#appModeInfo");
 info.innerHTML=m?'<strong>'+esc(m.package_name)+'</strong>'+Number(m.duration_minutes||30)+' MIN · '+mn+'–'+mx+' PLAYERS · '+esc(m.venue_resource==="target"?"TARGET BAY":"MAIN ARENA")+'<p>'+esc(m.mode_details||"Follow FIELDZERO marshal instructions.")+'</p>Owner price: '+money(m.price_amount)+' per player'+(special?" · SPECIAL REQUEST / ADMIN APPROVAL":"")
 :"Choose an experience to see current rules and prices.";
 $("#appBookingPrice").textContent=m?money(Number(m.price_amount)*Number(select.value||1))+" EST. SESSION COST":"SELECT A GAME EXPERIENCE";
 updateSlots();
}
$("#appField").onchange=()=>{
 const f=state.fields.find(x=>x.id===$("#appField").value),launch=String(state.siteSettings?.launch_date||"2026-12-10");
 $("#appDate").min=f?.is_main&&launch>today()?launch:today();
 if($("#appDate").value<$("#appDate").min)$("#appDate").value=$("#appDate").min;
 updateSlots();
};
$("#appExperience").onchange=modeChange;
$("#appDate").onchange=updateSlots;
$("#appSpecial").onchange=modeChange;
$("#appPlayers").onchange=()=>{
 const m=currentMode();$("#appBookingPrice").textContent=m?money(Number(m.price_amount)*Number($("#appPlayers").value||1))+" EST. SESSION COST":"SELECT A GAME EXPERIENCE";
};
$("#appStart").onchange=()=>$$(".fz-slot").forEach(el=>el.classList.toggle("chosen",el.dataset.time===$("#appStart").value));
function openPeriods(dayStr){
 const day=new Date(dayStr+"T12:00:00Z").getUTCDay();
 return day===0||day===6?[[9,12],[15,22]]:[[15,22]];
}
async function updateSlots(){
 const req=++state.slotsReq,select=$("#appStart"),holder=$("#appSlots");
 const m=currentMode(),date=$("#appDate").value,field=$("#appField").value;
 if(!date||!field||!m){select.innerHTML='<option value="">Choose a field, game and date</option>';holder.innerHTML="";return;}
 if(date<$("#appDate").min){select.innerHTML='<option value="">Choose an opening-day or later date</option>';holder.innerHTML="";return;}
 const duration=Math.max(30,Number(m.duration_minutes)||30);
 const starts=openPeriods(date).flatMap(([from,to])=>{
  const out=[];
  for(let x=from;x<to;x+=.5){
   const time=String(Math.floor(x)).padStart(2,"0")+":"+(x%1?"30":"00");
   const when=localDateTime(date,time);
   if(when>new Date()&&x+duration/60<=to)out.push(time);
  }
  return out;
 });
 if(!starts.length){holder.innerHTML='<div class="fz-slot-note">No future standard slots on this date.</div>';select.innerHTML='<option value="">No times</option>';return;}
 holder.innerHTML='<div class="fz-slot-note">Checking real-time availability…</div>';
 const from=localDateTime(date,"00:00").toISOString(),to=localDateTime(date,"23:59").toISOString();
 const {data,error}=await db.from("public_arena_bookings").select("booking_start,booking_end,status,booking_resource")
  .eq("field_id",field).eq("booking_resource",m.venue_resource||"arena").gte("booking_start",from).lte("booking_start",to);
 if(req!==state.slotsReq)return;
 if(error){holder.innerHTML='<div class="fz-slot-note">Availability temporarily unavailable. Try again.</div>';select.innerHTML='<option value="">Unavailable</option>';return;}
 const available=starts.filter(time=>{
  const start=localDateTime(date,time),end=new Date(start.getTime()+duration*60000);
  return !(data||[]).some(r=>new Date(r.booking_start)<end&&new Date(r.booking_end)>start);
 });
 const previous=select.value;
 select.innerHTML='<option value="">Choose an available time</option>'+available.map(t=>'<option value="'+t+'">'+t+'</option>').join("");
 if(available.includes(previous))select.value=previous;
 holder.innerHTML=available.length?starts.map(t=>'<button type="button" class="fz-slot '+(select.value===t?"chosen":"")+'" data-time="'+t+'" '+(available.includes(t)?"":"disabled")+'>'+t+'</button>').join("")
 :'<div class="fz-slot-note">No free slots on this date. Select another date.</div>';
 holder.querySelectorAll("[data-time]").forEach(b=>b.onclick=()=>{select.value=b.dataset.time;holder.querySelectorAll("[data-time]").forEach(x=>x.classList.toggle("chosen",x===b));});
}
function drawBookingAccess(){
 const signed=!!state.user;
 $("#bookingSignInPrompt").hidden=signed;
 $("#appBookingForm").hidden=!signed;
 if(signed&&!state.fields.length)loadPublicData();
}
$("#appBookingForm").onsubmit=async event=>{
 event.preventDefault();if(!state.user){showScreen("profile");return;}
 if(!online()){msg($("#appBookingStatus"),"You must be online to book.","error");return;}
 const f=new FormData(event.currentTarget),mode=currentMode(),status=$("#appBookingStatus");
 if(!mode){msg(status,"Select a current game mode.","error");return;}
 const date=String(f.get("date")||""),time=String(f.get("start_time")||"");
 if(!time){msg(status,"Choose an available start time.","error");return;}
 const start=localDateTime(date,time),end=new Date(start.getTime()+(Number(mode.duration_minutes)||30)*60000);
 const payload={field_id:String(f.get("field_id")||""),real_name:String(f.get("real_name")||"").trim(),
  callsign:String(f.get("callsign")||"").trim(),mobile:String(f.get("mobile")||"").trim(),
  experience:mode.package_name,booking_start:start.toISOString(),booking_end:end.toISOString(),
  player_count:Number(f.get("player_count"))||1,special_request:f.get("special_request")==="true",
  notes:String(f.get("notes")||"").trim().slice(0,500),privacy_consent:f.get("consent")==="on"};
 const btn=$("#appBookSubmit");btn.disabled=true;btn.textContent="SAVING BOOKING…";
 try{
  const result=await invoke("fz_app_create_booking",{p_booking:payload}),row=Array.isArray(result)?result[0]:result;
  if(!row?.booking_reference)throw Error("Booking saved without a reference. Contact FIELDZERO.");
  $("#appBookingReference").textContent=row.booking_reference;
  $("#appBookingSuccessDetail").textContent=(row.status==="approved"?"Reservation approved. ":"Request received. ")+
   "Arrive 15 minutes early. Save this reference for check-in; payment rules shown at the venue apply.";
  $("#appBookingSuccess").hidden=false;$("#appBookingForm").hidden=true;
  document.querySelector("#appBookingSuccess")?.scrollIntoView({behavior:"smooth",block:"center"});
  await refreshBookings();toast("Booking saved to your FIELDZERO account");
 }catch(e){msg(status,e.message,"error");}
 finally{btn.disabled=false;btn.textContent="CONFIRM RESERVATION ↗";}
};
$("#copyBookingRef").onclick=()=>copyText($("#appBookingReference").textContent);
async function copyText(str){try{await navigator.clipboard.writeText(str);toast("Copied to clipboard");}catch(_){prompt("Copy FIELDZERO reference",str);}}

async function refreshBookings(){
 if(!state.user){state.bookings=[];renderBookings();return;}
 const {data,error}=await db.rpc("fz_app_my_bookings");
 if(error){$("#gamesList").innerHTML='<div class="fz-empty">'+esc(error.message)+'</div>';return;}
 state.bookings=data||[];renderBookings();renderHome();
}
function bookingCard(b){
 const date=new Date(b.booking_start),upcoming=date>new Date()&&!["rejected","cancelled"].includes(b.status);
 const klass=/cancel|reject/.test(b.status)?"rejected":/pending|hold/.test(b.status)?"pending":"";
 return '<article class="fz-booking-card"><div class="fz-booking-top"><div><small>FIELDZERO / '+(upcoming?"UPCOMING DEPLOYMENT":"BOOKING RECORD")+'</small><strong>'+esc(b.experience||"FIELD SESSION")+'</strong></div><span class="fz-pill '+klass+'">'+esc((b.status||"pending").replaceAll("_"," ").toUpperCase())+'</span></div>'+
 '<div class="fz-booking-reference">'+esc(b.booking_reference)+'</div>'+
 '<div class="fz-booking-facts"><span>◷ '+esc(fmtDate(b.booking_start))+'</span><span>♜ '+Number(b.player_count||1)+' PLAYER(S)</span><span>'+money(b.quoted_amount)+' EST.</span></div>'+
 '<div class="fz-booking-foot"><small>'+esc((b.payment_status||"").replaceAll("_"," ").toUpperCase())+
 (Number(b.deposit_required_amount)>0?" · ADVANCE "+money(b.deposit_required_amount):" · NO ADVANCE SHOWN")+
 '</small><button type="button" data-copy-booking="'+esc(b.booking_reference)+'" class="fz-mini-btn">COPY ID</button></div></article>';
}
function wireNav(root){root?.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>showScreen(b.dataset.nav));}
function renderBookings(){
 const host=$("#gamesList");if(!host)return;
 if(!state.user){host.innerHTML='<div class="fz-empty"><strong>SIGN IN TO VIEW YOUR BOOKINGS</strong><p>Your booking history is private.</p><button class="fz-btn fz-btn-green" type="button" data-nav="profile">SIGN IN ↗</button></div>';$("#claimOldBooking").hidden=true;wireNav(host);return;}
 $("#claimOldBooking").hidden=false;
 const now=Date.now(),filter=state.gamesFilter;
 const rows=state.bookings.filter(b=>{
  const d=new Date(b.booking_start).getTime();
  return filter==="all"||(filter==="upcoming"?d>=now&&b.status!=="rejected"&&b.status!=="cancelled":d<now||b.status==="cancelled"||b.status==="rejected");
 });
 host.innerHTML=rows.length?rows.map(bookingCard).join("")
  :'<div class="fz-empty"><strong>NO '+(filter==="history"?"PAST":"UPCOMING")+' MISSIONS YET.</strong><p>Book a game to start your FIELDZERO history.</p><button type="button" class="fz-btn fz-btn-green" data-nav="book">BOOK A MISSION ↗</button></div>';
 host.querySelectorAll("[data-copy-booking]").forEach(b=>b.onclick=()=>copyText(b.dataset.copyBooking));wireNav(host);
}
$$("[data-games-filter]").forEach(b=>b.onclick=()=>{state.gamesFilter=b.dataset.gamesFilter;$$("[data-games-filter]").forEach(x=>x.classList.toggle("active",x===b));renderBookings();});
$("#refreshBookings").onclick=refreshBookings;
$("#claimForm").onsubmit=async e=>{
 e.preventDefault();if(!state.user)return showScreen("profile");
 const f=new FormData(e.currentTarget),el=$("#claimStatus"),btn=e.currentTarget.querySelector("button[type=submit]");
 btn.disabled=true;msg(el,"Verifying booking…");
 try{const ref=await invoke("fz_app_claim_booking",{p_reference:String(f.get("reference")||"").trim(),p_mobile:String(f.get("mobile")||"").trim()});
 msg(el,"Booking "+ref+" linked to your account.","success");e.currentTarget.reset();await refreshBookings();}
 catch(err){msg(el,err.message,"error");}finally{btn.disabled=false;}
};
function renderHome(){
 const host=$("#homeIdentity"),stats=$("#homeStats"),ctx=state.context||{},account=ctx.account||{},player=ctx.player||{},op=ctx.operator||{},team=ctx.team;
 if(state.user){
  const callsign=player.callsign||op.callsign||account.display_name||state.user.email?.split("@")[0]||"OPERATOR";
  host.innerHTML='<div class="fz-identity-avatar">'+(account.avatar_url?'<img alt="" src="'+esc(account.avatar_url)+'">':esc(callsign.slice(0,2).toUpperCase()))+'</div><div><span class="fz-muted-caps">OPERATOR IDENTITY / '+esc(ctx.state||"NOT LINKED")+'</span><strong>'+esc(callsign.toUpperCase())+'</strong><small>'+esc(team?.name||"FIELDZERO COMMUNITY MEMBER")+'</small></div><button class="fz-card-arrow" data-nav="profile" type="button" aria-label="Open operator profile">↗</button>';
  const upcoming=state.bookings.filter(b=>new Date(b.booking_start)>new Date()&&b.status!=="cancelled"&&b.status!=="rejected").length;
  stats.innerHTML=[["RANK",player.player_rank||"RECRUIT"],["MISSIONS",String(upcoming)],["SQUAD",team?.name||"SOLO"]].map(([k,v])=>'<div><strong>'+esc(v)+'</strong><small>'+k+'</small></div>').join("");
 }else{
  host.innerHTML='<div class="fz-identity-avatar">FZ</div><div><span class="fz-muted-caps">OPERATOR IDENTITY</span><strong>JOIN THE FIELDZERO NETWORK</strong><small>Register to save bookings and join squads.</small></div><button class="fz-card-arrow" data-nav="profile" type="button" aria-label="Open sign in">↗</button>';
  stats.innerHTML=[["RANK","—"],["MISSIONS","0"],["SQUAD","—"]].map(([k,v])=>'<div><strong>'+v+'</strong><small>'+k+'</small></div>').join("");
 }
 const list=$("#homeBookings"),coming=state.bookings.filter(b=>new Date(b.booking_start)>new Date()&&b.status!=="cancelled"&&b.status!=="rejected").slice(0,2);
 list.innerHTML=coming.length?coming.map(bookingCard).join(""):'<div class="fz-empty"><strong>NO UPCOMING GAMES</strong><p>Reserve your first mission or explore field sessions.</p><button class="fz-btn fz-btn-green" type="button" data-nav="book">EXPLORE BOOKINGS ↗</button></div>';
 list.querySelectorAll("[data-copy-booking]").forEach(b=>b.onclick=()=>copyText(b.dataset.copyBooking));wireNav(host);wireNav(list);
}
function renderSquads(){
 const host=$("#squadList"),q=$("#squadSearch").value.trim().toLowerCase(),ctx=state.context||{},team=ctx.team,person=$("#mySquad");
 if(team){
  person.innerHTML='<span class="fz-card-kicker">YOUR ACTIVE SQUAD</span><h3>'+esc(team.name)+'</h3><p>'+Number(team.member_count||0)+'/5 MEMBERS · '+(team.is_leader?"YOU ARE THE CAPTAIN":"ACTIVE OPERATOR")+'</p><button class="fz-btn fz-btn-ghost" id="leaveTeam" type="button">LEAVE SQUAD ↗</button>';
  $("#leaveTeam").onclick=async()=>{
    if(!confirm("Leave your current FIELDZERO squad?"))return;
    try{await invoke("fz_member_leave_team");toast("Squad left");await refreshPersonalData();}catch(e){toast(e.message);}
  };
 }else if(state.user&&ctx.state==="active"){
  person.innerHTML='<span class="fz-card-kicker">YOUR SQUAD</span><h3>INDEPENDENT OPERATOR</h3><p>Request to join a recruiting squad. The captain must approve.</p>'+(ctx.pending_join?'<p>Pending request: '+esc(ctx.pending_join.team_name||"SQUAD")+'</p>':"");
 }else{
  person.innerHTML='<span class="fz-card-kicker">YOUR SQUAD</span><h3>BUILD A TEAM</h3><p>'+(state.user?"Your squad privileges unlock after Operator approval.":"Sign in to join a squad of up to five players.")+'</p>';
 }
 const rows=state.squads.filter(s=>s.name.toLowerCase().includes(q));
 host.innerHTML=rows.length?rows.map(s=>{
  const canRequest=state.user&&ctx.state==="active"&&!team&&!ctx.pending_join&&Number(s.member_count)<5;
  return '<article class="fz-squad-card"><div><strong>'+esc(s.name)+'</strong><small>'+Number(s.member_count)+'/5 OPERATORS · '+Number(s.points||0)+' XP'+(Number(s.member_count)>=5?" · FULL":"")+'</small></div><button class="fz-btn fz-btn-ghost" data-team-id="'+esc(s.id)+'" type="button" '+(!canRequest?"disabled":"")+'>'+(team?.id===s.id?"YOUR SQUAD":canRequest?"REQUEST TO JOIN ↗":"VIEW ROSTER")+'</button></article>';
 }).join(""):'<div class="fz-empty">No squads match your search.</div>';
 host.querySelectorAll("[data-team-id]").forEach(b=>b.onclick=async()=>{
  const id=b.dataset.teamId;if(!state.user)return showScreen("profile");
  if(state.context?.state!=="active"){toast("Squad access requires an approved Operator profile.");return;}
  b.disabled=true;try{await invoke("fz_member_request_team",{p_team_id:id});toast("Join request sent for captain approval");await refreshPersonalData();}
  catch(e){toast(e.message);b.disabled=false;}
 });
 const cap=$("#captainQueue");cap.innerHTML="";
 if(team?.is_leader){
  db.rpc("fz_member_get_team_join_requests").then(({data,error})=>{
   if(error||!data?.length){cap.innerHTML='<div class="fz-app-card"><span class="fz-card-kicker">CAPTAIN INBOX</span><p>No pending requests.</p></div>';return;}
   cap.innerHTML='<div class="fz-app-card"><span class="fz-card-kicker">CAPTAIN / JOIN REQUESTS</span>'+data.map(x=>
    '<article class="fz-squad-card"><div><strong>'+esc(x.callsign)+'</strong><small>REQUESTS TO JOIN '+esc(x.team_name)+'</small></div><div class="fz-action-row"><button class="fz-mini-btn" data-review-id="'+esc(x.id)+'" data-decision="approve">APPROVE</button><button class="fz-mini-btn" data-review-id="'+esc(x.id)+'" data-decision="reject">DECLINE</button></div></article>').join("")+'</div>';
   cap.querySelectorAll("[data-review-id]").forEach(b=>b.onclick=async()=>{
    b.disabled=true;try{await invoke("fz_member_review_team_join",{p_request_id:b.dataset.reviewId,p_decision:b.dataset.decision});toast("Request reviewed");await refreshPersonalData();}
    catch(e){toast(e.message);b.disabled=false;}
   });
  });
 }
}
$("#squadSearch").oninput=renderSquads;
