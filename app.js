(() => {
  const config = window.FIELDZERO_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const clientReady = !!(window.supabase && config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes("YOUR-PROJECT") &&
    !config.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE"));
  const db = clientReady ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  $("#year").textContent = new Date().getFullYear();

  const menuToggle = $("#menuToggle"), mainNav = $("#mainNav");
  menuToggle.addEventListener("click", () => {
    const open = mainNav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });
  mainNav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
    mainNav.classList.remove("open"); menuToggle.setAttribute("aria-expanded", "false");
  }));

  const channelUrl = safeWhatsApp(config.WHATSAPP_CHANNEL_URL);
  const groupUrl = safeWhatsApp(config.WHATSAPP_GROUP_URL);
  const footerLinks = $("#footerLinks");
  if (channelUrl) footerLinks.insertAdjacentHTML("beforeend", ` <a href="${escapeAttr(channelUrl)}" target="_blank" rel="noopener noreferrer">WHATSAPP CHANNEL ↗</a>`);
  if (groupUrl) footerLinks.insertAdjacentHTML("beforeend", ` <a href="${escapeAttr(groupUrl)}" target="_blank" rel="noopener noreferrer">COMMUNITY GROUP ↗</a>`);

  function safeWhatsApp(url) {
    try { const u = new URL(url); return u.protocol === "https:" && (u.hostname === "chat.whatsapp.com" || u.hostname === "whatsapp.com" || u.hostname === "www.whatsapp.com") && !url.includes("REPLACE_WITH") ? u.href : ""; } catch { return ""; }
  }
  function escapeHtml(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function escapeAttr(v) { return escapeHtml(v); }
  function status(el, message, kind) { el.textContent = message; el.className = "form-status" + (kind ? " " + kind : ""); }

  function notConfigured() {
    $("#rosterCount").textContent = "DATABASE NOT CONFIGURED";
    $("#rosterGrid").innerHTML = '<div class="empty-state">Connect Supabase to display the approved callsign roster. Registration will stay disabled until configuration is complete.</div>';
    $("#teamsGrid").innerHTML = '<div class="empty-state">Squads will appear here once the database is configured and teams are created by an admin.</div>';
    $("#eventsGrid").innerHTML = '<div class="empty-state">Upcoming sessions and tournaments will appear here once published by an admin.</div>';
    if ($("#bookingEvent")) $("#bookingEvent").innerHTML = '<option value="">Configure Supabase and publish an event first</option>';
    $("#submitBooking").disabled = true;
    $("#submitApplication").disabled = true;
    status($("#formStatus"), "Registration is not live yet. The site owner must finish the Supabase setup first.", "error");
  }

  async function loadRoster() {
    if (!db) return;
    const { data, error } = await db.from("public_roster").select("callsign, team_name, player_rank").order("callsign");
    if (error) { $("#rosterCount").textContent = "ROSTER UNAVAILABLE"; $("#rosterGrid").innerHTML = '<div class="empty-state">Could not load the roster. Please try again later.</div>'; return; }
    renderRoster(data || []);
  }
  function renderRoster(rows) {
    const q = ($("#rosterSearch").value || "").trim().toLowerCase();
    const filtered = rows.filter(p => (p.callsign || "").toLowerCase().includes(q));
    $("#rosterCount").textContent = `${filtered.length} APPROVED OPERATOR${filtered.length === 1 ? "" : "S"}`;
    $("#rosterGrid").innerHTML = filtered.length ? filtered.map((p, i) => `<article class="operator-card"><div class="operator-top"><span>OPERATOR / ${String(i+1).padStart(3,"0")}</span><span>● ACTIVE</span></div><div class="operator-call">${escapeHtml(p.callsign)}</div><div class="operator-team">${escapeHtml(p.team_name || "INDEPENDENT")} · ${escapeHtml(p.player_rank || "ROOKIE")}</div></article>`).join("") : '<div class="empty-state">No approved callsigns match that search yet.</div>';
  }
  $("#rosterSearch").addEventListener("input", () => { if (db) loadRoster(); });

  async function loadTeams() {
    if (!db) return;
    const { data: teams, error } = await db.from("public_teams").select("id,name,team_rank,points,member_count").order("team_rank", {ascending:true});
    if (error) { $("#teamsGrid").innerHTML = '<div class="empty-state">Could not load squads right now.</div>'; return; }
    if (!teams?.length) { $("#teamsGrid").innerHTML = '<div class="empty-state">No squads published yet. Check back soon.</div>'; return; }
    const ids = teams.map(t => t.id);
    const { data: members } = await db.from("public_team_roster").select("team_id,callsign").in("team_id", ids).order("callsign");
    $("#teamsGrid").innerHTML = teams.map(t => {
      const list = (members || []).filter(m => m.team_id === t.id);
      const slots = Array.from({length:8}, (_,i) => list[i] ? `<div class="team-player"><span>◈</span><b>${escapeHtml(list[i].callsign)}</b></div>` : `<div class="team-player slot"><span>＋</span><span>OPEN SLOT ${String(i+1).padStart(2,"0")}</span></div>`).join("");
      const count = Math.min(Number(t.member_count || list.length), 8);
      return `<article class="team-card"><div class="team-head"><div class="team-badge">${escapeHtml((t.name || "FZ").slice(0,2).toUpperCase())}</div><div class="team-title"><h3>${escapeHtml(t.name)}</h3><p>${count}/8 ACTIVE PLAYERS · ${Number(t.points || 0)} PTS</p></div><div class="team-rank">#${String(t.team_rank || "—").padStart(2,"0")}</div></div><div class="team-meter"><span style="width:${count/8*100}%"></span></div><div class="team-roster">${slots}</div></article>`;
    }).join("");
  }
  let publicEvents = [];
  async function loadEvents() {
    if (!db) return;
    const { data, error } = await db.from("public_events").select("id,title,event_type,event_date,description,location").order("event_date", {ascending:true}).limit(6);
    if (error) { $("#eventsGrid").innerHTML = '<div class="empty-state">Could not load events right now.</div>'; return; }
    publicEvents = data || [];
    fillBookingEvents(publicEvents);
    if (!data?.length) { $("#eventsGrid").innerHTML = '<div class="empty-state">No events announced yet. Follow the community for the next game day.</div>'; return; }
    $("#eventsGrid").innerHTML = data.map(e => {
      const date = e.event_date ? new Date(e.event_date + "T12:00:00").toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"}) : "DATE TBA";
      return `<article class="event-card"><span class="event-type">${escapeHtml((e.event_type || "SESSION").toUpperCase())}</span><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.description || "Details will be announced by the organiser.")}</p><div class="event-meta"><span>▣ ${escapeHtml(date)}</span><span>⌖ ${escapeHtml(e.location || "FIELDZERO FIELD")}</span></div><a class="button button-lime event-book-link" href="event.html?id=${encodeURIComponent(e.id)}">${e.event_type === "Tournament" ? "REGISTER TEAM ↗" : "BOOK SESSION ↗"}</a></article>`;
    }).join("");
  }

  function fillBookingEvents(events) {
    const select = $("#bookingEvent");
    if (!select) return;
    const eligible = (events || []).filter(e => e.id && ["Session", "Tournament"].includes(e.event_type));
    select.innerHTML = eligible.length ? '<option value="">Choose an event…</option>' + eligible.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title)} — ${escapeHtml(e.event_type)}${e.event_date ? " · " + escapeHtml(e.event_date) : ""}</option>`).join("") : '<option value="">No bookable events published yet</option>';
    document.querySelectorAll("[data-event-id]").forEach(a => a.addEventListener("click", () => { select.value = a.dataset.eventId; }));
  }

  $("#bookingForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget, submit = $("#submitBooking"), statusEl = $("#bookingStatus");
    if (!db) { status(statusEl, "Bookings are not live yet. The site owner must finish Supabase setup.", "error"); return; }
    const fd = new FormData(form);
    if (fd.get("bookingConsent") !== "on") { status(statusEl, "Please confirm the booking privacy notice.", "error"); return; }
    if (!fd.get("eventId")) { status(statusEl, "Choose a published session or tournament first.", "error"); return; }
    submit.disabled = true; submit.textContent = "SENDING REQUEST…";
    const selected = publicEvents.find(e => e.id === fd.get("eventId"));
    const bookingType = selected?.event_type === "Tournament" ? "Tournament" : "Session";
    const { error } = await db.from("event_bookings").insert({
      event_id: fd.get("eventId"), booking_type: bookingType,
      real_name: String(fd.get("realName") || "").trim(),
      callsign: String(fd.get("callsign") || "").trim().replace(/\s+/g, " "),
      mobile: String(fd.get("mobile") || "").trim(), player_count: Number(fd.get("playerCount") || 1),
      notes: String(fd.get("notes") || "").trim(), privacy_consent: true
    });
    submit.disabled = false; submit.innerHTML = 'REQUEST BOOKING <span>↗</span>';
    if (error) { status(statusEl, "We couldn't submit the booking. Check the event and try again, or contact the organiser on WhatsApp.", "error"); return; }
    form.reset(); status(statusEl, "Booking request received. The organiser must approve it before your place is confirmed.", "success");
  });

  $("#registrationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget, submit = $("#submitApplication"), statusEl = $("#formStatus");
    if (!db) { status(statusEl, "Registration is not live yet. The site owner must finish the Supabase setup first.", "error"); return; }
    const fd = new FormData(form);
    const realName = String(fd.get("realName") || "").trim();
    const callsign = String(fd.get("callsign") || "").trim().replace(/\s+/g, " ");
    const mobile = String(fd.get("mobile") || "").trim();
    const consent = fd.get("consent") === "on";
    if (!consent) { status(statusEl, "Please confirm the privacy notice before submitting.", "error"); return; }
    if (realName.length < 2 || callsign.length < 2 || mobile.length < 7) { status(statusEl, "Please check your name, callsign and mobile number.", "error"); return; }
    submit.disabled = true; submit.textContent = "SUBMITTING APPLICATION…";
    const { error } = await db.from("player_applications").insert({
      real_name: realName, callsign, mobile,
      primary_blaster: fd.get("gun"),
      team_preference: fd.get("teamPreference"),
      play_style: fd.get("playStyle"),
      privacy_consent: true
    });
    submit.disabled = false; submit.innerHTML = "SUBMIT APPLICATION <span>↗</span>";
    if (error) {
      const msg = error.code === "23505" ? "That callsign has already been requested. Try another callsign or contact the admin." :
        error.code === "42501" ? "The registration database policy is not configured correctly. Please contact the site admin." :
        "We couldn't submit your application. Please check your connection and try again.";
      status(statusEl, msg, "error"); return;
    }
    form.reset();
    status(statusEl, "Application received. Your callsign will appear on the public roster only after an admin approves it. Please use the WhatsApp links below to follow community updates.", "success");
  });


  // V2: calendar availability, public player profiles, leader requests and squad challenges.
  const localISO = d => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
  const slDateTime = (date,hour,minute=0) => new Date(`${date}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00+05:30`);
  const dateInput = $("#arenaDate");
  if (dateInput) { dateInput.min=localISO(new Date()); dateInput.value=localISO(new Date()); }
  function openingHours(dateStr) {
    if (!dateStr) return [];
    const d=new Date(dateStr+"T12:00:00"), day=d.getDay();
    if(day===0||day===6) return [...Array.from({length:3},(_,i)=>9+i),...Array.from({length:7},(_,i)=>15+i)];
    return Array.from({length:7},(_,i)=>15+i);
  }
  async function loadArenaSlots(){
    const grid=$("#arenaSlots"), select=$("#arenaStartTime"); if(!grid||!select)return;
    if(!db){grid.innerHTML="<div class=\"empty-state\">Connect Supabase and run supabase/upgrade-v2.sql to load live availability.</div>";select.innerHTML="<option value=\"\">Database not configured</option>";return;}
    const date=dateInput.value, hours=openingHours(date); let rows=[];
    if(db){const from=slDateTime(date,0).toISOString(),to=slDateTime(date,23,59).toISOString();const {data,error}=await db.from("public_arena_bookings").select("booking_start,booking_end,status,player_count").gte("booking_start",from).lte("booking_start",to);if(!error)rows=data||[];}
    const dur=Number($("#arenaDuration").value||1), options=[];
    grid.innerHTML=hours.map(h=>{const start=slDateTime(date,h),end=new Date(start.getTime()+dur*3600000);const overlap=rows.find(r=>new Date(r.booking_start)<end&&new Date(r.booking_end)>start);const outside=dur>1&&!hours.includes(h+dur-1);const state=outside?'closed':overlap?(overlap.status==='approved'?'booked':'pending'):'free';if(state==='free')options.push({value:String(h),label:`${String(h).padStart(2,'0')}:00`});return `<button type="button" class="arena-slot ${state}" data-hour="${h}" ${state!=='free'?'disabled':''}><b>${String(h).padStart(2,'0')}:00</b><small>${state==='free'?'AVAILABLE':state==='pending'?'REQUESTED':state==='booked'?'BOOKED':'CLOSED'}</small></button>`}).join('')||'<div class="empty-state">No regular opening hours on this date. Use a special booking request for an alternative time.</div>';
    select.innerHTML='<option value="">Choose an available start time…</option>'+options.map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
    grid.querySelectorAll('[data-hour]').forEach(b=>b.addEventListener('click',()=>{select.value=b.dataset.hour;select.scrollIntoView({behavior:'smooth',block:'center'});}));
  }
  if(dateInput){dateInput.addEventListener('change',loadArenaSlots);$("#arenaDuration").addEventListener('change',loadArenaSlots);loadArenaSlots();}
  const specialToggle=$("#specialRequest"); if(specialToggle) specialToggle.addEventListener("change",()=>{const slot=$("#arenaStartTime");slot.required=specialToggle.value!=="true";});
  const arenaForm=$("#arenaBookingForm"); if(arenaForm) arenaForm.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(arenaForm),el=$("#arenaBookingStatus");if(!db){status(el,'Database is not configured yet.','error');return}const h=fd.get('startTime'),special=fd.get('specialRequest')==='true',specialTime=String(fd.get('specialTime')||'');if(!h&&!special){status(el,'Choose an available start time or select special booking request.','error');return}const date=dateInput.value;const parts=(special&&specialTime)?specialTime.split(':').map(Number):[Number(h||15),0];const start=slDateTime(date,parts[0],parts[1]||0);const end=new Date(start.getTime()+Number($("#arenaDuration").value||1)*3600000);if(!special&&!openingHours(date).includes(Number(h))){status(el,'That start time is outside regular opening hours. Select special request instead.','error');return}const payload={real_name:String(fd.get('realName')).trim(),callsign:String(fd.get('callsign')).trim(),mobile:String(fd.get('mobile')).trim(),booking_start:start.toISOString(),booking_end:end.toISOString(),player_count:Number(fd.get('playerCount')),special_request:special,notes:String(fd.get('notes')||'').trim(),privacy_consent:true};const btn=$("#submitArenaBooking");btn.disabled=true;const {error}=await db.from('arena_bookings').insert(payload);btn.disabled=false;if(error){status(el,error.message?.includes('overlaps')?'That time is already booked. Please choose another slot.':'Could not submit booking. Check database migration and try again.','error');return}arenaForm.reset();dateInput.value=date;await loadArenaSlots();status(el,'Request received. Your slot is not confirmed until the admin approves it.','success');});
  const profileForm=$("#profileSearchForm");if(profileForm)profileForm.addEventListener('submit',async e=>{e.preventDefault();const box=$("#playerProfile"),call=$("#profileCallsign").value.trim();if(!db){box.innerHTML='<div class="empty-state">Database is not configured.</div>';return}const {data,error}=await db.from('public_player_profiles').select('callsign,player_rank,player_points,playing_hours,matches_played,wins,preferred_role,joined_on,win_rate,team_name').ilike('callsign',call).maybeSingle();if(error||!data){box.innerHTML='<div class="empty-state">No approved player profile found for that callsign.</div>';return}box.innerHTML=`<article class="profile-card"><div class="profile-call">${escapeHtml(data.callsign)}</div><div class="profile-sub">${escapeHtml(data.team_name||'INDEPENDENT')} · ${escapeHtml(data.player_rank)}</div><div class="profile-stats"><div><b>${Number(data.player_points)}</b><span>POINTS</span></div><div><b>${Number(data.playing_hours).toFixed(1)}</b><span>PLAY HOURS</span></div><div><b>${Number(data.matches_played)}</b><span>MATCHES</span></div><div><b>${Number(data.wins)}</b><span>WINS</span></div><div><b>${Number(data.win_rate)}%</b><span>WIN RATE</span></div><div><b>${escapeHtml(data.preferred_role)}</b><span>ROLE</span></div></div><small>Roster since ${escapeHtml(data.joined_on||'—')} · Stats maintained by FIELDZERO admin.</small></article>`;});
  async function loadChallengeTeams(){if(!db)return;const {data,error}=await db.from('public_challenge_teams').select('id,name,team_rank,points').order('team_rank');if(error)return;['leaderTeam','challengingTeam','challengedTeam'].forEach(id=>{const el=$('#'+id);if(!el)return;el.innerHTML='<option value="">Choose a squad…</option>'+(data||[]).map(t=>`<option value="${t.id}">${escapeHtml(t.name)} · #${t.team_rank}</option>`).join('')});}
  if(db)loadChallengeTeams();
  const leaderForm=$('#leaderForm');if(leaderForm)leaderForm.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(leaderForm),el=$('#leaderStatus');if(!db){status(el,'Database is not configured.','error');return}const {error}=await db.from('team_leader_requests').insert({team_id:fd.get('teamId'),callsign:String(fd.get('callsign')).trim(),mobile:String(fd.get('mobile')).trim(),email:String(fd.get('email')||'').trim()});status(el,error?'Could not submit leader registration. Check the V2 database migration.':'Leader registration submitted for admin review.',error?'error':'success');if(!error)leaderForm.reset();});
  const challengeForm=$('#challengeForm');if(challengeForm)challengeForm.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(challengeForm),el=$('#challengeStatus');if(!db){status(el,'Database is not configured.','error');return}if(fd.get('challengingTeam')===fd.get('challengedTeam')){status(el,'Choose two different squads.','error');return}const {error}=await db.from('team_challenges').insert({challenging_team_id:fd.get('challengingTeam'),challenged_team_id:fd.get('challengedTeam'),leader_callsign:String(fd.get('leaderCallsign')).trim(),leader_mobile:String(fd.get('leaderMobile')).trim(),proposed_format:fd.get('format'),proposed_date:fd.get('proposedDate')||null,message:String(fd.get('message')||'').trim()});status(el,error?'Could not submit challenge. Check V2 migration and choose an active squad.':'Challenge sent to FIELDZERO admin for review. The admin must contact the challenged team leader; this starter does not send automatic WhatsApp/push alerts.',error?'error':'success');if(!error)challengeForm.reset();});

  if (!db) notConfigured();
  else Promise.all([loadRoster(), loadTeams(), loadEvents()]);
})();
