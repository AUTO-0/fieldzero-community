
(()=>{
"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const conf=window.FIELDZERO_CONFIG||{},db=window.supabase?.createClient(conf.SUPABASE_URL,conf.SUPABASE_ANON_KEY);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>Number(v||0).toLocaleString("en-LK",{maximumFractionDigits:2});
const dt=v=>v?new Date(v).toLocaleString("en-LK",{timeZone:"Asia/Colombo",dateStyle:"medium",timeStyle:"short"}):"—";
let user=null,owner=false,fields=[],items=[],sessions=[],bookings=[],issues=[],game=null;
const field=()=>$("#inventoryField").value;
const message=(s,error=false)=>{const el=$("#inventoryMessage");el.textContent=s;el.classList.toggle("error",error);};
async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data;}
const run=async(fn)=>{message("Processing inventory operation…");try{await fn();message("Record saved.");await refresh();}catch(e){message(e.message||String(e),true);}};
function available(i){return Math.max(0,Number(i.stock_on_hand)-(i.kind==="reusable"?Number(i.outstanding_reusable):0));}
function expected(i){const count=Number(i.used_sessions_30d);if(count<3||i.kind!=="consumable")return null;return Math.ceil(Number(i.issued_30d)/count*Number(i.booked_next_30d));}
function reorder(i){const e=expected(i);if(e===null)return null;return Math.max(0,Math.ceil(e*1.2+Number(i.reorder_point)-Number(i.stock_on_hand)));}
async function initialize(){
 const {data:{user:me}}=await db.auth.getUser();if(!me){$("#accessMessage").innerHTML='Sign in first at the <a href="staff.html">FIELDZERO Staff Desk</a>.';return;}
 user=me;const {data:isOwner}=await db.rpc("is_fieldzero_admin");owner=isOwner===true;
 let allowed=[];
 if(owner){const {data,error}=await db.from("arena_fields").select("id,name,active").eq("active",true);if(error)throw Error(error.message);allowed=data||[];}
 else{
  const {data:assigned,error}=await db.from("fz_workers").select("field_id").eq("user_id",me.id).eq("active",true);
  if(error)throw Error(error.message);
  const ids=(assigned||[]).map(w=>w.field_id);
  if(ids.length){const f=await db.from("arena_fields").select("id,name,active").in("id",ids).eq("active",true);if(f.error)throw Error(f.error.message);allowed=f.data||[];}
 }
 if(!allowed.length){$("#accessMessage").textContent="No active field-worker access. Contact the owner.";return;}
 fields=allowed;
 $("#accessMessage").hidden=true;$("#inventoryWorkspace").hidden=false;$("#logout").hidden=false;
 $("#inventoryIdentity").textContent=(owner?"OWNER":"WORKER")+" / "+(me.email||"");
 $("#ownerInventory").hidden=!owner;
 $("#inventoryField").innerHTML=allowed.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join("");
 await refresh();
 const fromLink=new URLSearchParams(location.search).get("booking");
 if(fromLink&&bookings.some(b=>b.id===fromLink)){$("#gameBooking").value=fromLink;await openGame(fromLink);}
}
async function refresh(){
 const p=await Promise.all([
  db.from("fz_inventory_forecast").select("*").eq("field_id",field()).order("name"),
  db.from("fz_game_sessions").select("*").eq("field_id",field()).order("started_at",{ascending:false}).limit(80),
  db.from("arena_bookings").select("id,booking_reference,booking_start,experience,player_count,status").eq("field_id",field()).eq("status","approved").order("booking_start",{ascending:false}).limit(180)
 ]);
 for(const q of p){if(q.error){message(q.error.message,true);return;}}
 items=p[0].data||[];sessions=p[1].data||[];bookings=p[2].data||[];
 drawStats();drawStock();drawForecast();drawBookings();drawGames();
 if(game){game=sessions.find(s=>s.id===game.id)||null;if(game)await showGame(game.id);}
}
function drawStats(){
 const c=items.filter(i=>i.kind==="consumable"),r=items.filter(i=>i.kind==="reusable");
 const n=sessions.filter(x=>x.status==="completed").length;
 const pending=r.reduce((s,i)=>s+Number(i.outstanding_reusable),0);
 $("#inventoryMetrics").innerHTML=[
  ["ACTIVE STOCK ITEMS",items.filter(i=>i.active).length],
  ["REUSABLE UNITS OUT",fmt(pending)],
  ["GAMES RECORDED",sessions.length],
  ["COMPLETED GAMES",n]
 ].map(([label,value])=>'<article class="metric"><strong>'+value+'</strong><small>'+label+'</small></article>').join("");
}
function drawStock(){
 const rows=items.map(i=>{
  const a=available(i),low=a<=Number(i.reorder_point);
  return '<tr><td><b>'+esc(i.name)+'</b><small>'+esc(i.sku)+' / '+esc(i.category)+'</small></td><td><span class="pill">'+esc(i.kind)+'</span></td>'+
  '<td><span class="stock-stat '+(low?"low":"")+'">'+fmt(a)+'</span><small>'+esc(i.unit)+' available</small></td><td>'+fmt(i.stock_on_hand)+'<small>'+esc(i.unit)+' stock</small></td>'+
  '<td>'+fmt(i.issued_7d)+'<small>issued / 7d</small></td><td>'+(owner?'<button class="ghost" data-edit-item="'+esc(i.id)+'">EDIT</button>':'')+'</td></tr>';
 }).join("");
 $("#stockTable").innerHTML=items.length?'<table><thead><tr><th>ITEM</th><th>TYPE</th><th>AVAILABLE</th><th>STOCK</th><th>USAGE</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<p>No inventory created yet. The owner can add guns, masks, gel balls and other stock here.</p>';
 $$("[data-edit-item]").forEach(b=>b.onclick=()=>editItem(b.dataset.editItem));
 const select=items.filter(i=>i.active&&available(i)>0);
 $("#issueItem").innerHTML=select.length?select.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+' · '+fmt(available(i))+' '+esc(i.unit)+' available</option>').join(""):'<option value="">No stock available</option>';
}
function drawForecast(){
 $("#forecastTable").innerHTML=items.length?'<table><thead><tr><th>ITEM</th><th>30D USAGE</th><th>USAGE / GAME</th><th>30D PREDICTION</th><th>REORDER GUIDANCE</th></tr></thead><tbody>'+items.map(i=>{
  const n=Number(i.used_sessions_30d),avg=n?Number(i.issued_30d)/n:null,p=expected(i),r=reorder(i);
  const guidance=i.kind==="reusable"?(n<3?"Needs 3 recorded games":available(i)<Math.ceil(avg||0)?"Available units below average game demand":"Reusable — return and inspect"):
    p===null?"Not enough history":(r>0?"Consider "+fmt(r)+" "+i.unit:"Stock covers current estimate");
  return '<tr><td><b>'+esc(i.name)+'</b><small>'+esc(i.kind)+'</small></td><td>'+fmt(i.issued_30d)+' '+esc(i.unit)+'</td><td>'+(avg===null?"—":fmt(avg))+'</td><td>'+(p===null?"Not enough data":fmt(p)+" "+esc(i.unit))+'</td><td>'+esc(guidance)+'</td></tr>';
 }).join("")+'</tbody></table>':'<p>Inventory records will appear here once the owner adds stock items.</p>';
}
function drawBookings(){
 $("#gameBooking").innerHTML=bookings.length?bookings.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.booking_reference||"GAME")+' / '+esc(b.experience||"")+' / '+dt(b.booking_start)+'</option>').join(""):'<option value="">No approved bookings</option>';
 if(game){const b=bookings.find(x=>x.id===game.booking_id);if(b)$("#gameBooking").value=b.id;}
}
function drawGames(){
 $("#gameHistory").innerHTML=sessions.length?sessions.map(s=>
 '<button class="record clickable '+(game?.id===s.id?"active":"")+'" data-game="'+esc(s.id)+'"><b>'+esc(s.game_mode)+'</b><small>'+dt(s.started_at)+' · '+s.player_count+' players</small><span class="pill">'+esc(s.status)+'</span></button>').join(""):'<p>No recorded games. Start one from an approved booking.</p>';
 $$("[data-game]").forEach(el=>el.onclick=()=>showGame(el.dataset.game));
}
async function openGame(id){
 const players=Number($("#gamePlayers").value)||null;
 const {data,error}=await db.rpc("fz_staff_open_game",{p_booking_id:id,p_players:players,p_notes:$("#gameNotes").value||""});
 if(error)throw Error(error.message);
 await refresh();await showGame(data);
}
async function showGame(id){
 game=sessions.find(x=>x.id===id);if(!game)return;
 $("#activeGameActions").hidden=false;
 $("#activeGameTitle").textContent=game.game_mode.toUpperCase()+" / "+game.status.toUpperCase();
 $("#activeGameMeta").textContent=dt(game.started_at)+" · "+game.player_count+" players · "+(game.notes||"No notes");
 const {data,error}=await db.from("fz_inventory_issues")
 .select("id,item_id,quantity,returned_qty,issued_at,notes").eq("session_id",id).order("issued_at",{ascending:false});
 if(error){message(error.message,true);return;}issues=data||[];
 $("#issueForm").hidden=game.status==="completed";
 $("#completeGame").disabled=game.status==="completed";
 $("#gameIssues").innerHTML=issues.length?issues.map(x=>{
  const i=items.find(z=>z.id===x.item_id);
  const reusable=i?.kind==="reusable",outstanding=Number(x.quantity)-Number(x.returned_qty);
  return '<article><div><b>'+esc(i?.name||"Item")+'</b><small>Issued '+fmt(x.quantity)+' '+esc(i?.unit||"")+' · '+dt(x.issued_at)+'</small><small>'+ (reusable?"Returned "+fmt(x.returned_qty)+" / "+fmt(x.quantity):"Consumed "+fmt(x.quantity))+'</small></div>'+
  (reusable&&outstanding>0&&game.status==="open"?'<button class="ghost" data-return="'+esc(x.id)+'">RETURN '+fmt(outstanding)+'</button>':'')+'</article>';
 }).join(""):'<p>No equipment or gel balls issued to this game yet.</p>';
 $$("[data-return]").forEach(el=>el.onclick=()=>run(async()=>{
  const u=issues.find(x=>x.id===el.dataset.return);
  if(!u)return;
  const left=Number(u.quantity)-Number(u.returned_qty);
  const qty=Number(prompt("How many units are being returned?",String(left)));
  if(!Number.isFinite(qty)||qty<=0)return;
  await rpc("fz_staff_return_item",{p_issue_id:u.id,p_quantity:qty});
 }));
 drawGames();
}
function editItem(id){
 if(!owner)return;
 const i=items.find(x=>x.id===id);if(!i)return;
 const f=$("#stockForm");for(const key of ["id","sku","name","category","kind","unit","stock_on_hand","reorder_point","notes"]){const el=f.elements.namedItem(key);if(el)el.value=i[key]??"";}
 f.elements.namedItem("active").checked=i.active;
 $("#ownerInventory").scrollIntoView({behavior:"smooth",block:"start"});
}
$("#stockForm").onsubmit=e=>{e.preventDefault();if(!owner)return;const f=new FormData(e.currentTarget);
 run(()=>rpc("fz_owner_save_stock",{
 p_field_id:field(),p_sku:String(f.get("sku")),p_name:String(f.get("name")),
 p_category:String(f.get("category")),p_kind:String(f.get("kind")),p_unit:String(f.get("unit")),
 p_stock:Number(f.get("stock_on_hand")),p_reorder:Number(f.get("reorder_point")),
 p_notes:String(f.get("notes")||""),p_id:f.get("id")||null,p_active:f.get("active")==="on"
 })).then(()=>{$("#stockForm").reset();$("#stockForm [name=id]").value="";});};
$("#clearStock").onclick=()=>{$("#stockForm").reset();$("#stockForm [name=id]").value="";};
$("#openGameForm").onsubmit=e=>{e.preventDefault();if(!$("#gameBooking").value){message("Choose a confirmed booking.",true);return;}run(async()=>{await openGame($("#gameBooking").value);});};
$("#issueForm").onsubmit=e=>{e.preventDefault();if(!game||game.status!=="open")return;
 const item=$("#issueItem").value;const qty=Number($("#issueQuantity").value);
 run(async()=>{await rpc("fz_staff_issue_item",{p_session_id:game.id,p_item_id:item,p_quantity:qty,p_notes:$("#issueNote").value||""});
 $("#issueNote").value="";});};
$("#completeGame").onclick=()=>{if(!game)return;run(()=>rpc("fz_staff_complete_game",{p_session_id:game.id,p_players:game.player_count,p_notes:$("#endNotes").value||""}));};
$("#inventoryField").onchange=async()=>{game=null;$("#activeGameActions").hidden=true;await refresh();};
$("#reload").onclick=refresh;
$("#logout").onclick=async()=>{await db.auth.signOut();location.href="staff.html";};
db.auth.getSession().then(({data:{session}})=>{if(!session){$("#accessMessage").innerHTML='Sign in first at the <a href="staff.html">FIELDZERO Staff Desk</a>.';return;}initialize().catch(e=>{$("#accessMessage").textContent=e.message;});});
})();
