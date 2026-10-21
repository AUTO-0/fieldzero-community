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
    const { data, error } = await db.from("public_events").select("title,event_type,event_date,description,location").order("event_date", {ascending:true}).limit(6);
    if (error) { $("#eventsGrid").innerHTML = '<div class="empty-state">Could not load events right now.</div>'; return; }
    publicEvents = data || [];
    fillBookingEvents(publicEvents);
    if (!data?.length) { $("#eventsGrid").innerHTML = '<div class="empty-state">No events announced yet. Follow the community for the next game day.</div>'; return; }
    $("#eventsGrid").innerHTML = data.map(e => {
      const date = e.event_date ? new Date(e.event_date + "T12:00:00").toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"}) : "DATE TBA";
      return `<article class="event-card"><span class="event-type">${escapeHtml((e.event_type || "SESSION").toUpperCase())}</span><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.description || "Details will be announced by the organiser.")}</p><div class="event-meta"><span>▣ ${escapeHtml(date)}</span><span>⌖ ${escapeHtml(e.location || "FIELDZERO FIELD")}</span></div><a class="button button-lime event-book-link" href="#book" data-event-id="${escapeHtml(e.id)}">${e.event_type === "Tournament" ? "REGISTER TEAM ↗" : "BOOK SESSION ↗"}</a></article>`;
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

  if (!db) notConfigured();
  else Promise.all([loadRoster(), loadTeams(), loadEvents()]);
})();
