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
  const contactLinks = $("#contactCommunityLinks");
  if (contactLinks) {
    const links = [];
    if (channelUrl) links.push(`<a class="contact-link" href="${escapeAttr(channelUrl)}" target="_blank" rel="noopener noreferrer">FOLLOW WHATSAPP CHANNEL ↗</a>`);
    if (groupUrl) links.push(`<a class="contact-link" href="${escapeAttr(groupUrl)}" target="_blank" rel="noopener noreferrer">JOIN COMMUNITY GROUP ↗</a>`);
    if (links.length) contactLinks.innerHTML = links.join("");
  }

  // Reference-inspired filters: these are client-side presentation filters and do not alter database records.
  document.querySelectorAll("[data-mode-filter]").forEach(button => button.addEventListener("click", () => {
    const chosen = button.dataset.modeFilter;
    document.querySelectorAll("[data-mode-filter]").forEach(b => b.classList.toggle("active", b === button));
    document.querySelectorAll("[data-mode-category]").forEach(card => {
      const categories = (card.dataset.modeCategory || "").split(/\s+/);
      card.hidden = chosen !== "all" && !categories.includes(chosen);
    });
  }));
  document.querySelectorAll("[data-package-filter]").forEach(button => button.addEventListener("click", () => {
    const chosen = button.dataset.packageFilter;
    document.querySelectorAll("[data-package-filter]").forEach(b => b.classList.toggle("active", b === button));
    document.querySelectorAll("[data-package-category]").forEach(card => {
      const categories = (card.dataset.packageCategory || "").split(/\s+/);
      card.hidden = chosen !== "all" && !categories.includes(chosen);
    });
  }));
  document.querySelectorAll(".package-request[data-package]").forEach(link => link.addEventListener("click", () => {
    const experience = $("#bookingExperience");
    if (experience) experience.value = link.dataset.package;
  }));

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
    const grid = $("#teamsGrid");
    const { data: teams, error } = await db.from("public_teams").select("id,name,team_rank,points,member_count").order("team_rank", {ascending:true}).order("name");
    if (error) { grid.innerHTML = '<div class="empty-state">Squads could not load. The site owner should check the FIELDZERO V6 database migration and public view permissions.</div>'; return; }
    if (!teams?.length) { grid.innerHTML = '<div class="empty-state">No public squads yet. An admin can create a squad and assign at least one approved player. Squads can recruit up to five operators.</div>'; return; }
    const ids = teams.map(t => t.id);
    const { data: members, error: memberError } = await db.from("public_team_roster").select("team_id,callsign,team_leader").in("team_id", ids).order("callsign");
    if (memberError) { grid.innerHTML = '<div class="empty-state">Squads loaded, but member rosters could not be read. Check the V6 public_team_roster view.</div>'; return; }
    grid.innerHTML = teams.map((t, i) => {
      const list = (members || []).filter(m => m.team_id === t.id);
      const leader = list.find(m => m.team_leader);
      const slots = Array.from({length:5}, (_,n) => list[n] ? `<div class="team-player ${list[n].team_leader ? 'team-captain' : ''}"><span>${list[n].team_leader ? '★' : '◈'}</span><b>${escapeHtml(list[n].callsign)}</b>${list[n].team_leader ? '<small>CAPTAIN</small>' : ''}</div>` : `<div class="team-player slot"><span>＋</span><span>OPEN SLOT ${String(n+1).padStart(2,"0")}</span></div>`).join("");
      const count = Math.min(Number(t.member_count ?? list.length), 5);
      return `<article class="team-card"><div class="team-head"><div class="team-badge">${escapeHtml((t.name || "FZ").slice(0,2).toUpperCase())}</div><div class="team-title"><h3>${escapeHtml(t.name)}</h3><p>${count}/5 OPERATORS · ${Number(t.points || 0)} PTS</p>${leader ? `<small class="team-leader-label">★ CAPTAIN: ${escapeHtml(leader.callsign)}</small>` : '<small class="team-leader-label">CAPTAIN TO BE ANNOUNCED</small>'}</div><div class="team-rank">#${String(t.team_rank || i+1).padStart(2,"0")}</div></div><div class="team-meter"><span style="width:${count/5*100}%"></span></div><div class="team-roster">${slots}</div><div class="team-card-footer"><span>${count === 5 ? 'SQUAD FULL' : `${5-count} OPEN ${5-count===1?'SLOT':'SLOTS'}`}</span><a href="#challenges" class="team-challenge-link" data-challenge-squad="${escapeAttr(t.id)}">CHALLENGE / VIEW RIVALS ↗</a></div></article>`;
    }).join("");
    grid.querySelectorAll('[data-challenge-squad]').forEach(link => link.addEventListener('click', () => {
      const select = $('#challengingTeam'); if (select) select.value = link.dataset.challengeSquad;
    }));
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
  const arenaForm=$("#arenaBookingForm"); if(arenaForm) arenaForm.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(arenaForm),el=$("#arenaBookingStatus");if(!db){status(el,'Database is not configured yet.','error');return}const h=fd.get('startTime'),special=fd.get('specialRequest')==='true',specialTime=String(fd.get('specialTime')||'');if(!h&&!special){status(el,'Choose an available start time or select special booking request.','error');return}const date=dateInput.value;const parts=(special&&specialTime)?specialTime.split(':').map(Number):[Number(h||15),0];const start=slDateTime(date,parts[0],parts[1]||0);const end=new Date(start.getTime()+Number($("#arenaDuration").value||1)*3600000);if(!special&&!openingHours(date).includes(Number(h))){status(el,'That start time is outside regular opening hours. Select special request instead.','error');return}const payload={real_name:String(fd.get('realName')).trim(),callsign:String(fd.get('callsign')).trim(),mobile:String(fd.get('mobile')).trim(),booking_start:start.toISOString(),booking_end:end.toISOString(),player_count:Number(fd.get('playerCount')),special_request:special,notes:[fd.get('experience') ? `Experience: ${String(fd.get('experience')).trim()}` : '', String(fd.get('notes')||'').trim()].filter(Boolean).join(' | ').slice(0,700),privacy_consent:true};const btn=$("#submitArenaBooking");btn.disabled=true;const {error}=await db.from('arena_bookings').insert(payload);btn.disabled=false;if(error){status(el,error.message?.includes('overlaps')?'That time is already booked. Please choose another slot.':'Could not submit booking. Check database migration and try again.','error');return}arenaForm.reset();dateInput.value=date;await loadArenaSlots();status(el,'Request received. Your slot is not confirmed until the admin approves it.','success');});
  const profileForm=$("#profileSearchForm");if(profileForm)profileForm.addEventListener('submit',async e=>{e.preventDefault();const box=$("#playerProfile"),call=$("#profileCallsign").value.trim();if(!db){box.innerHTML='<div class="empty-state">Database is not configured.</div>';return}const {data,error}=await db.from('public_player_profiles').select('callsign,player_rank,player_points,playing_hours,matches_played,wins,preferred_role,joined_on,win_rate,team_name').ilike('callsign',call).maybeSingle();if(error||!data){box.innerHTML='<div class="empty-state">No approved player profile found for that callsign.</div>';return}box.innerHTML=`<article class="profile-card"><div class="profile-call">${escapeHtml(data.callsign)}</div><div class="profile-sub">${escapeHtml(data.team_name||'INDEPENDENT')} · ${escapeHtml(data.player_rank)}</div><div class="profile-stats"><div><b>${Number(data.player_points)}</b><span>POINTS</span></div><div><b>${Number(data.playing_hours).toFixed(1)}</b><span>PLAY HOURS</span></div><div><b>${Number(data.matches_played)}</b><span>MATCHES</span></div><div><b>${Number(data.wins)}</b><span>WINS</span></div><div><b>${Number(data.win_rate)}%</b><span>WIN RATE</span></div><div><b>${escapeHtml(data.preferred_role)}</b><span>ROLE</span></div></div><small>Roster since ${escapeHtml(data.joined_on||'—')} · Stats maintained by FIELDZERO admin.</small></article>`;});
  async function loadChallengeTeams(){
    const ids=['leaderTeam','challengingTeam','challengedTeam'];
    if(!db){ids.forEach(id=>{const el=$('#'+id);if(el)el.innerHTML='<option value="">Database unavailable</option>'});return}
    const {data,error}=await db.from('public_challenge_teams').select('id,name,team_rank,points,member_count').order('team_rank').order('name');
    if(error){ids.forEach(id=>{const el=$('#'+id);if(el)el.innerHTML='<option value="">Squads unavailable — check database migration</option>'});const help=$('#challengeTeamHelp');if(help)help.textContent='Squad list failed to load. The site owner should apply upgrade-v6.sql and check public view permissions.';return}
    const rows=data||[];
    ids.forEach(id=>{const el=$('#'+id);if(!el)return;const previous=el.value;el.innerHTML='<option value="">'+(rows.length?'Choose a squad…':'No public squads yet — ask admin to assign approved players')+'</option>'+rows.map(t=>`<option value="${escapeAttr(t.id)}">${escapeHtml(t.name)} · ${Number(t.member_count||0)}/5 · #${Number(t.team_rank||0)}</option>`).join('');if(rows.some(t=>t.id===previous))el.value=previous;});
    const help=$('#challengeTeamHelp');if(help)help.textContent=rows.length>=2?'Choose two different active squads. Squads with 1–5 players can be challenged.':`Currently ${rows.length} public squad${rows.length===1?'':'s'}. At least two squads with approved members are needed for a challenge.`;
  }
  if(db)loadChallengeTeams();
  const leaderForm=$('#leaderForm');if(leaderForm)leaderForm.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(leaderForm),el=$('#leaderStatus');if(!db){status(el,'Database is not configured.','error');return}const {error}=await db.from('team_leader_requests').insert({team_id:fd.get('teamId'),callsign:String(fd.get('callsign')).trim(),mobile:String(fd.get('mobile')).trim(),email:String(fd.get('email')||'').trim()});status(el,error?'Could not submit leader registration. Check the V2 database migration.':'Leader registration submitted for admin review.',error?'error':'success');if(!error)leaderForm.reset();});
  $('#challengingTeam')?.addEventListener('change',()=>{const own=$('#challengingTeam').value,opponent=$('#challengedTeam');if(opponent&&opponent.value===own)opponent.value='';if(opponent)Array.from(opponent.options).forEach(o=>{o.disabled=!!own&&o.value===own;});});
  const challengeForm=$('#challengeForm');if(challengeForm)challengeForm.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(challengeForm),el=$('#challengeStatus');if(!db){status(el,'Database is not configured.','error');return}if(fd.get('challengingTeam')===fd.get('challengedTeam')){status(el,'Choose two different squads.','error');return}const {error}=await db.from('team_challenges').insert({challenging_team_id:fd.get('challengingTeam'),challenged_team_id:fd.get('challengedTeam'),leader_callsign:String(fd.get('leaderCallsign')).trim(),leader_mobile:String(fd.get('leaderMobile')).trim(),proposed_format:fd.get('format'),proposed_date:fd.get('proposedDate')||null,message:String(fd.get('message')||'').trim()});status(el,error?'Could not submit challenge. Check V2 migration and choose an active squad.':'Challenge sent to FIELDZERO admin for review. The admin must contact the challenged team leader; this starter does not send automatic WhatsApp/push alerts.',error?'error':'success');if(!error)challengeForm.reset();});

  if (!db) notConfigured();
  else Promise.all([loadRoster(), loadTeams(), loadEvents()]);

  // V4 public leaderboard: only published, admin-maintained profile fields are queried.
  let currentBoard = "players";
  async function loadLeaderboard(board = currentBoard) {
    currentBoard = board; const target = $("#leaderboardTable"); if (!target) return;
    document.querySelectorAll("[data-board]").forEach(b => b.classList.toggle("active", b.dataset.board === board));
    if (!db) { target.innerHTML = '<div class="empty-state">Connect Supabase and apply the V4 migration to enable rankings.</div>'; return; }
    const isTeams = board === "teams";
    const table = isTeams ? "public_teams" : "public_player_profiles";
    const fields = isTeams ? "name,team_rank,points,member_count" : "callsign,player_rank,player_points,matches_played,wins";
    const sort = isTeams ? "points" : "player_points";
    const {data,error} = await db.from(table).select(fields).order(sort,{ascending:false}).limit(10);
    if(error) { target.innerHTML = '<div class="empty-state">Leaderboard unavailable. Confirm the V4 SQL migration has completed successfully.</div>'; return; }
    if(!data?.length) { target.innerHTML = '<div class="empty-state">No verified scores yet. Rankings appear after the admin records results and points.</div>'; return; }
    target.innerHTML = data.map((r,i)=>{ const name=isTeams?r.name:r.callsign; const pts=Number(isTeams?r.points:r.player_points)||0; const sub=isTeams?`${Number(r.member_count)||0}/5 OPERATORS`:`${escapeHtml(r.player_rank||"ROOKIE")} · ${Number(r.matches_played)||0} MATCHES · ${Number(r.wins)||0} WINS`; return `<div class="leaderboard-row"><div class="leaderboard-rank">${String(i+1).padStart(2,"0")}</div><div><div class="leaderboard-name">${escapeHtml(name)}</div><span class="leaderboard-sub">${sub}</span></div><div class="leaderboard-points">${pts.toLocaleString()}<small>POINTS</small></div></div>`; }).join("");
  }
  document.querySelectorAll("[data-board]").forEach(b=>b.addEventListener("click",()=>loadLeaderboard(b.dataset.board)));
  loadLeaderboard();

  // Public, immediately published feedback. Display names are optional; no contact details are collected.
  const feedbackForm=$('#feedbackForm');
  async function loadFeedback(){
    const list=$('#feedbackList'), summary=$('#feedbackSummary'); if(!list||!summary)return;
    if(!db){list.innerHTML='<div class="empty-state">Feedback will appear after the site database is configured.</div>';summary.textContent='DATABASE OFFLINE';return;}
    const {data,error}=await db.from('public_feedback').select('id,display_name,rating,comment,created_at').order('created_at',{ascending:false}).limit(12);
    if(error){list.innerHTML='<div class="empty-state">Feedback could not load. The site owner should apply upgrade-v6.sql.</div>';summary.textContent='UNAVAILABLE';return;}
    const rows=data||[]; const avg=rows.length?rows.reduce((a,r)=>a+Number(r.rating||0),0)/rows.length:0;
    summary.textContent=rows.length?`★ ${avg.toFixed(1)} / 5 · ${rows.length} RECENT`:'NO RATINGS YET';
    list.innerHTML=rows.length?rows.map(r=>`<article class="feedback-card"><div class="feedback-card-top"><b>${escapeHtml(r.display_name||'FIELDZERO PLAYER')}</b><span class="feedback-stars" aria-label="${Number(r.rating)} out of 5 stars">${'★'.repeat(Math.max(0,Math.min(5,Number(r.rating)||0)))}${'☆'.repeat(5-Math.max(0,Math.min(5,Number(r.rating)||0)))}</span></div><p>${escapeHtml(r.comment)}</p><small>${new Date(r.created_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}</small></article>`).join(''):'<div class="empty-state">No feedback yet. Be the first player to leave an after-action report.</div>';
  }
  document.querySelectorAll('.star-picker input[type="radio"]').forEach(radio=>radio.addEventListener('change',()=>{const group=radio.closest('.star-picker');group?.querySelectorAll('label').forEach(label=>label.classList.toggle('selected',Number(label.querySelector('input').value)<=Number(radio.value)));}));
  if(feedbackForm)feedbackForm.addEventListener('submit',async e=>{
    e.preventDefault();const el=$('#feedbackStatus'),button=$('#submitFeedback'),fd=new FormData(feedbackForm);
    if(!db){status(el,'Feedback is unavailable until the site database is configured.','error');return;}
    const rating=Number(fd.get('rating')),comment=String(fd.get('comment')||'').trim(),display_name=String(fd.get('displayName')||'').trim().slice(0,32);
    if(!(rating>=1&&rating<=5)){status(el,'Please select a star rating from 1 to 5.','error');return;}
    if(comment.length<5){status(el,'Please add a little more detail (at least 5 characters).','error');return;}
    button.disabled=true;const {error}=await db.from('feedback').insert({display_name:display_name||'FIELDZERO PLAYER',rating,comment,published:true});button.disabled=false;
    if(error){status(el,'Could not publish feedback. The site owner should apply upgrade-v6.sql and check database permissions.','error');return;}
    feedbackForm.reset();document.querySelectorAll('.star-picker label').forEach(label=>label.classList.remove('selected'));status(el,'Thanks — your feedback is now published. Please keep comments respectful.','success');await loadFeedback();
  });
  loadFeedback();

  // Session gallery: admin-uploaded public photos with lightbox and optional featured pop-up.
  const galleryGrid=$('#galleryGrid'), galleryCount=$('#galleryCount'), lightbox=$('#photoLightbox');
  let galleryPhotos=[], lightboxIndex=0;
  function renderGallery(){
    if(!galleryGrid||!galleryCount)return;
    galleryCount.textContent=`${galleryPhotos.length} SESSION PHOTO${galleryPhotos.length===1?'':'S'}`;
    if(!galleryPhotos.length){galleryGrid.innerHTML='<div class="empty-state gallery-empty">No session photos have been published yet. FIELDZERO highlights will appear here after the first gallery upload.</div>';return;}
    galleryGrid.innerHTML=galleryPhotos.map((photo,i)=>`<button type="button" class="gallery-card" data-gallery-index="${i}" aria-label="View ${escapeAttr(photo.title||'session photo')}"><img src="${escapeAttr(photo.image_url)}" alt="${escapeAttr(photo.title||'FIELDZERO session photo')}" loading="lazy"><span class="gallery-open-mark">↗</span><span class="gallery-card-copy"><small>${escapeHtml(photo.session_name||'FIELDZERO SESSION')}</small><b>${escapeHtml(photo.title||'FIELD MOMENT')}</b></span></button>`).join('');
    galleryGrid.querySelectorAll('[data-gallery-index]').forEach(button=>button.addEventListener('click',()=>openLightbox(Number(button.dataset.galleryIndex))));
  }
  async function loadGallery(){
    if(!galleryGrid)return;
    if(!db){galleryGrid.innerHTML='<div class="empty-state gallery-empty">Connect the FIELDZERO database to load session photos.</div>';if(galleryCount)galleryCount.textContent='GALLERY OFFLINE';return;}
    const {data,error}=await db.from('public_gallery_photos').select('id,title,session_name,image_url,popup_featured,created_at').order('created_at',{ascending:false});
    if(error){galleryGrid.innerHTML='<div class="empty-state gallery-empty">The gallery database is not ready yet. The site owner should run supabase/upgrade-v7-gallery.sql.</div>';galleryCount.textContent='GALLERY UNAVAILABLE';return;}
    galleryPhotos=data||[];renderGallery();
    const featured=galleryPhotos.find(photo=>photo.popup_featured);
    if(featured&&!sessionStorage.getItem('fz-featured-popup-seen')){
      sessionStorage.setItem('fz-featured-popup-seen','1');
      const popup=$('#featuredPopup');$('#featuredPopupImage').src=featured.image_url;$('#featuredPopupImage').alt=featured.title||'Featured FIELDZERO moment';$('#featuredPopupTitle').textContent=featured.title||'FROM THE FIELD';$('#featuredPopupSession').textContent=featured.session_name||'FIELDZERO SESSION';popup.hidden=false;document.body.style.overflow='hidden';
    }
  }
  function openLightbox(index){if(!galleryPhotos.length)return;lightboxIndex=(index+galleryPhotos.length)%galleryPhotos.length;const photo=galleryPhotos[lightboxIndex];$('#lightboxImage').src=photo.image_url;$('#lightboxImage').alt=photo.title||'FIELDZERO session photo';$('#lightboxCaption').textContent=`${photo.session_name||'FIELDZERO SESSION'} / ${photo.title||'FIELD MOMENT'} · ${lightboxIndex+1} OF ${galleryPhotos.length}`;lightbox.hidden=false;document.body.style.overflow='hidden';}
  function closeLightbox(){lightbox.hidden=true;document.body.style.overflow='';$('#lightboxImage').src='';}
  $('#lightboxClose')?.addEventListener('click',closeLightbox);$('#lightboxPrev')?.addEventListener('click',()=>openLightbox(lightboxIndex-1));$('#lightboxNext')?.addEventListener('click',()=>openLightbox(lightboxIndex+1));
  lightbox?.addEventListener('click',e=>{if(e.target===lightbox)closeLightbox()});
  function closeFeaturedPopup(){const popup=$('#featuredPopup');popup.hidden=true;document.body.style.overflow='';}
  $('#featuredPopupClose')?.addEventListener('click',closeFeaturedPopup);$('#featuredPopupView')?.addEventListener('click',()=>{closeFeaturedPopup();location.hash='#gallery'});
  $('#featuredPopup')?.addEventListener('click',e=>{if(e.target.id==='featuredPopup')closeFeaturedPopup()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(lightbox&&!lightbox.hidden)closeLightbox();if(!$('#featuredPopup').hidden)closeFeaturedPopup();}else if(lightbox&&!lightbox.hidden&&e.key==='ArrowRight')openLightbox(lightboxIndex+1);else if(lightbox&&!lightbox.hidden&&e.key==='ArrowLeft')openLightbox(lightboxIndex-1)});
  loadGallery();
})();
