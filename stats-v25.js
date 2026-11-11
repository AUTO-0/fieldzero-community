
/* FIELDZERO V25 verified usage analytics — all derived from actual session issues */
(()=>{
"use strict";
const conf=window.FIELDZERO_CONFIG||{},db=window.supabase?.createClient(conf.SUPABASE_URL,conf.SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number(v||0).toLocaleString("en-LK",{maximumFractionDigits:2});
const localDate=v=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(v);
const humanDate=v=>new Date(v).toLocaleString("en-LK",{timeZone:"Asia/Colombo",dateStyle:"medium",timeStyle:"short"});
let fields=[];
const field=()=>$("#statsField").value;
function errorMsg(s){$("#statsMessage").textContent=s;}
async function init(){
 const {data:{user}}=await db.auth.getUser();
 if(!user){$("#statsAccess").innerHTML='Sign in to the <a href="staff.html">FIELDZERO Staff Desk</a> first.';return;}
 const {data:own}=await db.rpc("is_fieldzero_admin");let allowed=[];
 if(own===true){const {data,error}=await db.from("arena_fields").select("id,name").eq("active",true);if(error)throw Error(error.message);allowed=data||[];}
 else {
  const w=await db.from("fz_workers").select("field_id").eq("user_id",user.id).eq("active",true);
  if(w.error)throw Error(w.error.message);
  const ids=(w.data||[]).map(x=>x.field_id);
  if(ids.length){const f=await db.from("arena_fields").select("id,name").in("id",ids).eq("active",true);if(f.error)throw Error(f.error.message);allowed=f.data||[];}
 }
 if(!allowed.length){$("#statsAccess").textContent="No active field permission. Ask the owner to assign this worker.";return;}
 fields=allowed;$("#statsAccess").hidden=true;$("#statsWorkspace").hidden=false;
 $("#statsIdentity").textContent=(own?"OWNER / ":"FIELD WORKER / ")+(user.email||"");
 $("#statsField").innerHTML=allowed.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join("");
 await refresh();
}
async function refresh(){
 errorMsg("Loading verified field data…");
 const t=Date.now(),cutoff=new Date(t-90*86400000).toISOString();
 const rs=await Promise.all([
  db.from("fz_game_sessions").select("id,booking_id,game_mode,player_count,status,started_at,finished_at").eq("field_id",field()).gte("started_at",cutoff).order("started_at",{ascending:false}).limit(400),
  db.from("fz_inventory_forecast").select("*").eq("field_id",field()).order("name")
 ]);
 const bad=rs.find(x=>x.error);if(bad){errorMsg(bad.error.message);return;}
 const sessions=rs[0].data||[],stock=rs[1].data||[];
 const ids=sessions.map(x=>x.id);let issues=[];
 if(ids.length){
  // Batch large session lists to stay within standard query limits.
  for(let start=0;start<ids.length;start+=120){
   const r=await db.from("fz_inventory_issues").select("session_id,item_id,quantity,returned_qty,issued_at").in("session_id",ids.slice(start,start+120));
   if(r.error){errorMsg(r.error.message);return;}
   issues.push(...(r.data||[]));
  }
 }
 const sevenAgo=t-7*86400000,thirtyAgo=t-30*86400000;
 const recent=sessions.filter(s=>new Date(s.started_at).getTime()>=thirtyAgo);
 const completed=recent.filter(s=>s.status==="completed");
 const players=completed.reduce((n,s)=>n+Number(s.player_count),0);
 const consumed30=issues.filter(x=>new Date(x.issued_at).getTime()>=thirtyAgo && stock.find(i=>i.id===x.item_id)?.kind==="consumable");
 const consumedTotal=consumed30.reduce((n,x)=>n+Number(x.quantity),0);
 $("#statsMetrics").innerHTML=[
  ["GAMES / 30 DAYS",recent.length],["COMPLETED GAMES",completed.length],
  ["PLAYERS / COMPLETED GAMES",players],["CONSUMABLE UNITS ISSUED",fmt(consumedTotal)]
 ].map(([name,value])=>'<div class="metric"><strong>'+value+'</strong><small>'+name+'</small></div>').join("");
 // Actual day-of-game session count.
 const days=Array.from({length:7},(_,n)=>{
  const date=new Date(t-(6-n)*86400000),key=localDate(date);
  return {key,label:new Intl.DateTimeFormat("en-LK",{timeZone:"Asia/Colombo",weekday:"short"}).format(date),
   count:sessions.filter(s=>localDate(new Date(s.started_at))===key).length};
 });
 const max=Math.max(1,...days.map(x=>x.count));
 $("#statsBars").innerHTML=days.map(d=>
 '<div class="stats-bar-col"><span>'+d.count+'</span><div class="stats-bar-track"><div class="stats-bar-fill" style="height:'+Math.max(4,Math.round(100*d.count/max))+'%"></div></div><small>'+esc(d.label)+'</small></div>').join("");
 const modes=new Map();recent.forEach(s=>modes.set(s.game_mode,(modes.get(s.game_mode)||0)+1));
 $("#statsModes").innerHTML=modes.size?[...modes.entries()].sort((a,b)=>b[1]-a[1]).map(([name,n])=>
 '<article class="record stats-mode-row"><b>'+esc(name)+'</b><span class="pill">'+n+' GAMES</span></article>').join(""):'<p class="hint">No games have been recorded in the last 30 days.</p>';
 $("#statsItems").innerHTML=stock.length?'<table><thead><tr><th>ITEM</th><th>7D ISSUED</th><th>30D ISSUED</th><th>AVG / GAME</th><th>PREDICTED 30D</th><th>AVAILABLE</th></tr></thead><tbody>'+
 stock.map(i=>{
  const n=Number(i.used_sessions_30d)||0,avg=n>=1?Number(i.issued_30d)/n:null;
  const pred=i.kind==="consumable"&&n>=3?Math.ceil(avg*Number(i.booked_next_30d)):null;
  const available=Math.max(0,Number(i.stock_on_hand)-(i.kind==="reusable"?Number(i.outstanding_reusable):0));
  return '<tr><td><b>'+esc(i.name)+'</b><small>'+esc(i.kind)+'</small></td><td>'+fmt(i.issued_7d)+'</td><td>'+fmt(i.issued_30d)+'</td><td>'+(
   avg===null?"—":fmt(avg))+'</td><td>'+ (pred===null?"Awaiting usage data":fmt(pred)+" "+esc(i.unit))+'</td><td>'+fmt(available)+' '+esc(i.unit)+'</td></tr>';
 }).join("")+'</tbody></table>':'<p class="hint">Add field stock items under Inventory to start tracking usage and forecasts.</p>';
 $("#statsSessions").innerHTML=sessions.length?sessions.slice(0,70).map(s=>{
  const issued=issues.filter(x=>x.session_id===s.id).map(x=>{
   const it=stock.find(i=>i.id===x.item_id);
   return (it?.name||"Item")+": "+fmt(x.quantity)+(it?.kind==="reusable"?" issued; "+fmt(x.returned_qty)+" returned":" consumed");
  });
  return '<details class="record stats-game"><summary><span><b>'+esc(s.game_mode)+'</b><small>'+humanDate(s.started_at)+' · '+s.player_count+' players</small></span><span class="pill">'+esc(s.status)+'</span></summary><div class="stats-game-issues">'+
   (issued.length?issued.map(x=>'<p>'+esc(x)+'</p>').join(""):'<p>No equipment issued to this session.</p>')+'</div></details>';
 }).join(""):'<p class="hint">No session records yet. Checked-in games will appear automatically.</p>';
 errorMsg("Statistics refreshed from recorded sessions. No hypothetical bookings are counted as played games.");
}
$("#statsField").onchange=refresh;$("#statsRefresh").onclick=refresh;
db.auth.getSession().then(({data:{session}})=>{if(session)init().catch(e=>$("#statsAccess").textContent=e.message);
 else $("#statsAccess").innerHTML='Sign in at the <a href="staff.html">FIELDZERO Staff Desk</a> to view records.';});
})();
