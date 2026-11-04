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
  function renderSocialLinks(settings) {
    const profiles=[
      ["instagram_url","instagram","https://www.instagram.com/fiel_dzero/ ", '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.25" fill="currentColor"/></svg>'],
      ["facebook_url","facebook","https://www.facebook.com/","<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5h1.7V3.7c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2H7.3V13h2.8v8z\"/></svg>"],
      ["tiktok_url","tiktok","https://www.tiktok.com/@field.zero8","<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M19.6 8.2a7.1 7.1 0 0 1-4.3-1.4v7.1a5.8 5.8 0 1 1-5-5.7v3a2.8 2.8 0 1 0 2 2.7V2.8h3a4.2 4.2 0 0 0 4.3 4.1z\"/></svg>"]
    ];
    const links=profiles.map(([key,platform,fallback,icon])=>{
      const raw=String(settings?.[key]||fallback).trim();
      let href=fallback;
      try{const u=new URL(raw);if(u.protocol==="https:"&&[platform+".com","www."+platform+".com","m."+platform+".com"].includes(u.hostname))href=u.href;}catch{}
      return `<a class="social-profile-link social-icon-link social-${platform}" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" aria-label="Follow FIELDZERO on ${platform}" title="${platform.toUpperCase()}">${icon}<span class="social-link-label">${platform.toUpperCase()}</span></a>`;
    });
    const targets=[$("#headerSocialProfiles"),$("#socialProfiles"),$("#footerSocialProfiles")].filter(Boolean);
    targets.forEach(el=>{el.innerHTML=links.join("");el.hidden=false;});
  }

  function status(el, message, kind) { el.textContent = message; el.className = "form-status" + (kind ? " " + kind : ""); }

  // V9: public prices and a single priority-based announcement overlay.
  let siteSettings = null, siteSettingsReady = false, eventPopupReady = false, galleryPopupReady = false;
  let siteAppearance = null, appearanceReady = false, campaignsReady = false, seasonalCampaigns = [], activeSeasonalCampaign = null;
  let featuredEventForPopup = null, featuredPhotoForPopup = null;
  const THEME_KEYS = new Set(["field-ops","jungle-night","graphite","desert-recon","arctic-signal","ember-ops","lantern-glow","winter-night","monsoon"]);
  function applySiteTheme(themeKey) {
    const safeTheme = THEME_KEYS.has(themeKey) ? themeKey : "field-ops";
    document.body.dataset.fzTheme = safeTheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = ({"field-ops":"#111710","jungle-night":"#071a13","graphite":"#151619","desert-recon":"#2a2117","arctic-signal":"#112433","ember-ops":"#201510","lantern-glow":"#191e18","winter-night":"#0e1828","monsoon":"#112124"})[safeTheme];
  }
  function getSriLankaDate() { return new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
  function campaignIsInWindow(campaign, dateString=getSriLankaDate()) {
    if (!campaign?.start_date || !campaign?.end_date) return false;
    const current = dateString.slice(5); const start = String(campaign.start_date).slice(5); const end = String(campaign.end_date).slice(5);
    if (campaign.recurs_annually) return start <= end ? current >= start && current <= end : current >= start || current <= end;
    return dateString >= campaign.start_date && dateString <= campaign.end_date;
  }
  function campaignCta(campaign) {
    const target = campaign?.cta_target || "none";
    if (target === "join") return {href:"#memberArea", label:campaign.cta_label || "OPERATOR ACCOUNT ↗"};
    if (target === "events") return {href:"#events", label:campaign.cta_label || "VIEW EVENTS ↗"};
    if (target === "gallery") return {href:"#gallery", label:campaign.cta_label || "VIEW GALLERY ↗"};
    return null;
  }
  function renderSeasonalRibbon(campaign) {
    const ribbon=$("#seasonalRibbon"); if(!ribbon) return;
    if(!campaign || siteAppearance?.seasonal_enabled === false) { ribbon.hidden=true; return; }
    $("#seasonalRibbonKicker").textContent = `FIELDZERO / ${String(campaign.category||"SEASONAL NOTE").toUpperCase()}`;
    $("#seasonalRibbonTitle").textContent = campaign.title || "A NOTE FROM FIELDZERO";
    $("#seasonalRibbonMessage").textContent = campaign.message || "Best wishes to everyone observing this season.";
    const wrap=$("#seasonalRibbonImageWrap"), img=$("#seasonalRibbonImage"), cta=$("#seasonalRibbonCta");
    if(/^https:\/\//i.test(campaign.image_url||"")){img.src=campaign.image_url;img.alt=campaign.alt_text||campaign.title||"Seasonal FIELDZERO image";wrap.hidden=false;} else {img.removeAttribute("src");wrap.hidden=true;}
    const action=campaignCta(campaign);
    if(action){cta.href=action.href;cta.textContent=action.label;cta.hidden=false;} else {cta.hidden=true;}
    ribbon.hidden=false;
  }
  async function loadSiteAppearance() {
    if(!db){appearanceReady=true;siteAppearance={theme_key:"field-ops",seasonal_enabled:false};applySiteTheme("field-ops");maybeShowAnnouncement();return;}
    const {data,error}=await db.from("public_site_appearance").select("id,theme_key,seasonal_enabled").eq("id",1).maybeSingle();
    if(error){console.warn("FIELDZERO appearance settings unavailable; using default theme.",error.message);siteAppearance={theme_key:"field-ops",seasonal_enabled:false};}
    else siteAppearance=data||{theme_key:"field-ops",seasonal_enabled:true};
    applySiteTheme(siteAppearance.theme_key); appearanceReady=true;
    if(campaignsReady){activeSeasonalCampaign=siteAppearance.seasonal_enabled===false?null:(seasonalCampaigns.slice().sort((a,b)=>Number(b.priority||0)-Number(a.priority||0))[0]||null);if(activeSeasonalCampaign?.auto_theme)applySiteTheme(activeSeasonalCampaign.theme_key);renderSeasonalRibbon(activeSeasonalCampaign);}
    maybeShowAnnouncement();
  }
  async function loadSeasonalCampaigns() {
    if(!db){campaignsReady=true;maybeShowAnnouncement();return;}
    const {data,error}=await db.from("public_seasonal_campaigns").select("id,slug,title,category,message,image_url,alt_text,start_date,end_date,recurs_annually,active,popup_enabled,auto_theme,theme_key,cta_target,cta_label,priority");
    if(error){console.warn("FIELDZERO seasonal campaigns unavailable; apply V10 migration.",error.message);campaignsReady=true;maybeShowAnnouncement();return;}
    seasonalCampaigns=(data||[]).filter(c=>campaignIsInWindow(c));
    activeSeasonalCampaign=siteAppearance?.seasonal_enabled===false?null:(seasonalCampaigns.slice().sort((a,b)=>Number(b.priority||0)-Number(a.priority||0))[0]||null);
    if(activeSeasonalCampaign?.auto_theme) applySiteTheme(activeSeasonalCampaign.theme_key);
    else if(siteAppearance) applySiteTheme(siteAppearance.theme_key);
    renderSeasonalRibbon(activeSeasonalCampaign);
    campaignsReady=true; maybeShowAnnouncement();
  }
  const announcementPopup = $("#announcementPopup");
  const formatPrice = (amount) => Number(amount).toLocaleString("en-LK", {minimumFractionDigits:0,maximumFractionDigits:2});
  function renderSessionPrices(rows) {
    (rows || []).forEach(item => {
      const el = document.querySelector(`[data-session-price="${item.package_key}"]`);
      if (!el) return;
      const label = item.price_amount !== null && item.price_amount !== undefined
        ? `${escapeHtml(item.price_currency || "LKR")} <b>${formatPrice(item.price_amount)}</b>`
        : `<b>${escapeHtml(item.display_label || "Custom")}</b>`;
      el.innerHTML = `${label}${item.price_note ? `<small>${escapeHtml(item.price_note)}</small>` : ""}`;
      el.closest(".package-card")?.toggleAttribute("hidden", item.active === false);
    });
    const visibleKeys = new Set((rows || []).filter(item => item.active !== false).map(item => item.package_key));
    document.querySelectorAll("[data-session-price]").forEach(el => el.closest(".package-card")?.toggleAttribute("hidden", !visibleKeys.has(el.dataset.sessionPrice)));
  }
  async function loadSessionPrices() {
    if (!db) return;
    const {data,error} = await db.from("public_session_prices").select("package_key,package_name,price_amount,price_currency,display_label,price_note,active");
    if (error) { console.warn("FIELDZERO session prices unavailable; static prices remain visible.", error.message); return; }
    renderSessionPrices(data || []);
  }
  async function loadSiteSettings() {
    if (!db) { renderSocialLinks({}); siteSettingsReady = true; return; }
    const {data,error} = await db.from("public_site_settings").select("opening_soon_enabled,opening_soon_title,opening_soon_message,instagram_url,facebook_url,tiktok_url").eq("id",1).maybeSingle();
    if (!error) siteSettings = data || {opening_soon_enabled:true,opening_soon_title:"OPENING SOON",opening_soon_message:"FIELDZERO is preparing for deployment. Register your callsign now to join the community and receive launch updates."};
    else { console.warn("FIELDZERO site settings unavailable. Apply the V9 migration.", error.message); siteSettings = {opening_soon_enabled:false}; renderSocialLinks({}); }
    renderSocialLinks(siteSettings);
    siteSettingsReady = true;
    maybeShowAnnouncement();
  }
  function showAnnouncement(type) {
    if (!announcementPopup) return;
    const title=$("#announcementTitle"), kicker=$("#announcementKicker"), message=$("#announcementMessage");
    const info=$("#announcementEventInfo"), primary=$("#announcementPrimary"), secondary=$("#announcementSecondary");
    const media=$("#announcementMedia"), image=$("#announcementImage");
    info.hidden = true; media.hidden = true; secondary.hidden = true; primary.hidden = false;
    primary.href = "#memberArea"; primary.textContent = "OPERATOR ACCOUNT ↗";
    if (type === "opening") {
      kicker.textContent = "FIELDZERO / COMMUNITY NOTICE";
      title.textContent = siteSettings?.opening_soon_title || "OPENING SOON";
      message.textContent = siteSettings?.opening_soon_message || "FIELDZERO is preparing for deployment. Register your callsign now to join the community.";
      if (featuredEventForPopup) {
        populateEventAnnouncement(featuredEventForPopup);
        info.hidden = false; secondary.hidden = false;
        secondary.href = `event.html?id=${encodeURIComponent(featuredEventForPopup.id)}`;
        secondary.textContent = "VIEW NEXT MISSION ↗";
      }
    } else if (type === "event" && featuredEventForPopup) {
      kicker.textContent = "FIELDZERO / EVENT ANNOUNCEMENT";
      title.textContent = featuredEventForPopup.event_type === "Tournament" ? "TOURNAMENT ALERT" : "NEW MISSION ANNOUNCED";
      message.textContent = "A new FIELDZERO event is published. Review the details and send your registration request.";
      populateEventAnnouncement(featuredEventForPopup);
      info.hidden = false;
      primary.href = `event.html?id=${encodeURIComponent(featuredEventForPopup.id)}`;
      primary.textContent = featuredEventForPopup.event_type === "Tournament" ? "VIEW / REGISTER ↗" : "VIEW / BOOK SESSION ↗";
    } else if (type === "gallery" && featuredPhotoForPopup) {
      kicker.textContent = "FIELDZERO / FEATURED MOMENT";
      title.textContent = featuredPhotoForPopup.title || "FROM THE FIELD";
      message.textContent = featuredPhotoForPopup.session_name || "FIELDZERO SESSION";
      image.src = featuredPhotoForPopup.image_url; image.alt = featuredPhotoForPopup.title || "Featured FIELDZERO moment"; media.hidden = false;
      primary.href = "#gallery"; primary.textContent = "VIEW GALLERY ↗";
    } else if (type === "seasonal" && activeSeasonalCampaign) {
      const campaign=activeSeasonalCampaign;
      kicker.textContent = `FIELDZERO / ${String(campaign.category||"SEASONAL NOTE").toUpperCase()}`;
      title.textContent = campaign.title || "A NOTE FROM FIELDZERO";
      message.textContent = campaign.message || "Best wishes to everyone observing this season.";
      if(/^https:\/\//i.test(campaign.image_url||"")){image.src=campaign.image_url;image.alt=campaign.alt_text||campaign.title||"Seasonal FIELDZERO image";media.hidden=false;}
      const action=campaignCta(campaign);
      if(action){primary.href=action.href;primary.textContent=action.label;} else {primary.hidden=true;}
      if(action?.href==="#events") {secondary.href="#events";secondary.textContent="EXPLORE THE FIELD ↗";secondary.hidden=false;}
    }
    announcementPopup.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function populateEventAnnouncement(event) {
    $("#announcementEventTitle").textContent = event.title || "FIELDZERO EVENT";
    const parts = [];
    if (event.event_date) parts.push(new Date(`${event.event_date}T12:00:00`).toLocaleDateString("en-LK", {day:"2-digit",month:"short",year:"numeric"}));
    if (event.start_time) parts.push(event.start_time + (event.end_time ? `–${event.end_time}` : ""));
    if (event.location) parts.push(event.location);
    if (event.price_amount !== null && event.price_amount !== undefined) parts.push(Number(event.price_amount) === 0 ? "Price to be confirmed" : `${event.price_currency || "LKR"} ${formatPrice(event.price_amount)}`);
    $("#announcementEventMeta").textContent = parts.join(" · ") || "Date and details will be confirmed by the organiser.";
    $("#announcementEventDescription").textContent = event.description || "Details will be announced by the organiser.";
  }
  function maybeShowAnnouncement() {
    if (!announcementPopup || !db || !siteSettingsReady || !eventPopupReady || !galleryPopupReady || !appearanceReady || !campaignsReady || sessionStorage.getItem("fz-announcement-shown-v10")) return;
    let chosen=null;
    // One modal at a time. Preserve the launch notice until the owner switches Opening Soon off;
    // seasonal greetings still appear in the ribbon and can take popup priority after launch.
    if (siteSettings?.opening_soon_enabled) chosen="opening";
    else if (activeSeasonalCampaign?.popup_enabled) chosen="seasonal";
    else if (featuredEventForPopup) chosen="event";
    else if (featuredPhotoForPopup) chosen="gallery";
    if(!chosen) return;
    sessionStorage.setItem("fz-announcement-shown-v10", "1");
    showAnnouncement(chosen);
  }
  function closeAnnouncement() {
    if (announcementPopup) announcementPopup.hidden = true;
    document.body.style.overflow = "";
  }
  $("#announcementClose")?.addEventListener("click", closeAnnouncement);
  announcementPopup?.addEventListener("click", e => { if (e.target === announcementPopup) closeAnnouncement(); });
  $("#announcementPrimary")?.addEventListener("click", () => { closeAnnouncement(); });
  $("#announcementSecondary")?.addEventListener("click", () => { closeAnnouncement(); });

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
    const { data, error } = await db.from("public_roster").select("callsign, team_name, player_rank, avatar_url").order("callsign");
    if (error) { $("#rosterCount").textContent = "ROSTER UNAVAILABLE"; $("#rosterGrid").innerHTML = '<div class="empty-state">Could not load the roster. Please try again later.</div>'; return; }
    renderRoster(data || []);
    const countEl = $("#activeMemberCount");
    if (countEl) {
      const {data: countData} = await db.from("public_active_member_count").select("active_count").maybeSingle();
      countEl.textContent = String(countData?.active_count ?? (data || []).length);
    }
  }
  function renderRoster(rows) {
    const q = ($("#rosterSearch").value || "").trim().toLowerCase();
    const filtered = rows.filter(p => (p.callsign || "").toLowerCase().includes(q));
    $("#rosterCount").textContent = `${filtered.length} ACTIVE OPERATOR${filtered.length === 1 ? "" : "S"}`;
    $("#rosterGrid").innerHTML = filtered.length ? filtered.map((p, i) => `<article class="operator-card"><div class="operator-top"><span>OPERATOR / ${String(i+1).padStart(3,"0")}</span><span>● ACTIVE</span></div><div class="operator-call">${p.avatar_url?`<img class="operator-avatar" src="${escapeAttr(p.avatar_url)}" alt="${escapeAttr(p.callsign)} profile photo" loading="lazy">`:''}${escapeHtml(p.callsign)}</div><div class="operator-team">${escapeHtml(p.team_name || "INDEPENDENT")} · ${escapeHtml(p.player_rank || "ROOKIE")}</div></article>`).join("") : '<div class="empty-state">No approved callsigns match that search yet.</div>';
  }
  $("#rosterSearch").addEventListener("input", () => { if (db) loadRoster(); });

  async function loadTeams() {
    if (!db) return;
    const grid = $("#teamsGrid");
    const { data: teams, error } = await db.from("public_teams").select("id,name,team_rank,points,member_count").order("team_rank", {ascending:true}).order("name");
    if (error) { grid.innerHTML = '<div class="empty-state">Squads could not load. The site owner should check the FIELDZERO V6 database migration and public view permissions.</div>'; return; }
    if (!teams?.length) { grid.innerHTML = '<div class="empty-state">No public squads yet. An admin can create a squad and assign at least one approved player. Squads can recruit up to five operators.</div>'; return; }
    const ids = teams.map(t => t.id);
    const { data: members, error: memberError } = await db.from("public_team_roster").select("team_id,callsign,team_leader,avatar_url").in("team_id", ids).order("callsign");
    if (memberError) { grid.innerHTML = '<div class="empty-state">Squads loaded, but member rosters could not be read. Check the V6 public_team_roster view.</div>'; return; }
    grid.innerHTML = teams.map((t, i) => {
      const list = (members || []).filter(m => m.team_id === t.id);
      const leader = list.find(m => m.team_leader);
      const slots = Array.from({length:5}, (_,n) => list[n] ? `<div class="team-player ${list[n].team_leader ? 'team-captain' : ''}">${list[n].avatar_url?`<img class="team-player-avatar" src="${escapeAttr(list[n].avatar_url)}" alt="" loading="lazy">`:`<span>${list[n].team_leader ? '★' : '◈'}</span>`}<b>${escapeHtml(list[n].callsign)}</b>${list[n].team_leader ? '<small>CAPTAIN</small>' : ''}</div>` : `<div class="team-player slot"><span>＋</span><span>OPEN SLOT ${String(n+1).padStart(2,"0")}</span></div>`).join("");
      const count = Math.min(Number(t.member_count ?? list.length), 5);
      return `<article class="team-card"><div class="team-head"><div class="team-badge">${escapeHtml((t.name || "FZ").slice(0,2).toUpperCase())}</div><div class="team-title"><h3>${escapeHtml(t.name)}</h3><p>${count}/5 OPERATORS · ${Number(t.points || 0)} PTS</p>${leader ? `<small class="team-leader-label">★ CAPTAIN: ${escapeHtml(leader.callsign)}</small>` : '<small class="team-leader-label">CAPTAIN TO BE ANNOUNCED</small>'}</div><div class="team-rank">#${String(t.team_rank || i+1).padStart(2,"0")}</div></div><div class="team-meter"><span style="width:${count/5*100}%"></span></div><div class="team-roster">${slots}</div><div class="team-card-footer"><span>${count === 5 ? 'SQUAD FULL' : `${5-count} OPEN ${5-count===1?'SLOT':'SLOTS'}`}</span><a href="#challenges" class="team-challenge-link" data-challenge-squad="${escapeAttr(t.id)}">CHALLENGE / VIEW RIVALS ↗</a></div></article>`;
    }).join("");
    grid.querySelectorAll('[data-challenge-squad]').forEach(link => link.addEventListener('click', () => {
      const select = $('#challengingTeam'); if (select) select.value = link.dataset.challengeSquad;
    }));
  }
  let publicFields = [];
  const fieldNames = new Map();
  function fillFieldSelect(select, fields, firstLabel='Choose a field…') {
    if (!select) return;
    const previous = select.value;
    select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>` + fields.map(f => `<option value="${escapeAttr(f.id)}">${escapeHtml(f.name)}${f.is_main ? ' · MAIN' : ''}</option>`).join('');
    if (fields.some(f => f.id === previous)) select.value = previous;
    else if (fields.length) select.value = fields.find(f => f.is_main)?.id || fields[0].id;
  }
  async function loadFields() {
    const grid = $("#fieldsGrid"); if (!grid) return;
    if (!db) { grid.innerHTML = '<div class="empty-state">Field locations will appear here once Supabase is configured.</div>'; return; }
    const {data,error}=await db.from("public_arena_fields").select("id,name,address,google_maps_url,latitude,longitude,slug,is_main,booking_deposit_percent");
    if(error){grid.innerHTML='<div class="empty-state">Field locations could not load. Check the V8 and V15 fields migrations.</div>';return;}
    publicFields=(data||[]).sort((a,b)=>(b.is_main?1:0)-(a.is_main?1:0)||String(a.name).localeCompare(String(b.name)));
    publicFields.forEach(f=>fieldNames.set(f.id,f.name));
    if(!publicFields.length){grid.innerHTML='<div class="empty-state">No active fields have been published yet.</div>';return;}
    fillFieldSelect($("#arenaFieldSelect"),publicFields,'Choose a field…');
    const advanceHint=$("#bookingAdvanceRate"); if(advanceHint){const chosen=publicFields.find(f=>f.id===$("#arenaFieldSelect")?.value);advanceHint.textContent=chosen?`Fixed booking advance: LKR 500. The field admin verifies the payment before confirming your booking. Standard slot holds last 12 hours.`:'Every booking requires a fixed LKR 500 advance. Standard requests get a temporary 12-hour hold; special requests must be approved before payment is confirmed.';}
    fillFieldSelect($("#feedbackFieldSelect"),publicFields,'Choose the field you visited');
    const feedbackFilter=$("#feedbackFieldFilter");
    if(feedbackFilter){const previous=feedbackFilter.value;feedbackFilter.innerHTML='<option value="all">ALL FIELDZERO FIELDS</option>'+publicFields.map(f=>`<option value="${escapeAttr(f.id)}">${escapeHtml(f.name)}</option>`).join('');feedbackFilter.value=publicFields.some(f=>f.id===previous)?previous:'all';}
    fillFieldSelect($("#galleryFieldFilter"),publicFields,'ALL FIELDS');
    fillFieldSelect($("#eventsFieldFilter"),publicFields,'ALL FIELDS');
    // For public browsing filters, keep the all-fields option at the top.
    [$("#galleryFieldFilter"),$("#eventsFieldFilter")].filter(Boolean).forEach(select=>{
      const all=document.createElement('option');all.value='all';all.textContent='ALL FIELDS';select.insertBefore(all,select.firstChild);select.value='all';
    });
    const fieldSelect=$("#arenaFieldSelect");
    if(fieldSelect&&!fieldSelect.dataset.v15Bound){fieldSelect.dataset.v15Bound='1';fieldSelect.addEventListener('change',()=>{if(dateInput)loadArenaSlots();const chosen=publicFields.find(f=>f.id===fieldSelect.value);const hint=$("#bookingAdvanceRate");if(hint&&chosen)hint.textContent=`Fixed booking advance: LKR 500. The field admin verifies the payment before confirming your booking. Standard slot holds last 12 hours.`;});}
    document.dispatchEvent(new CustomEvent('fieldzero:fields-ready',{detail:{mainFieldId:publicFields.find(f=>f.is_main)?.id||publicFields[0]?.id||'',selectedFieldId:fieldSelect?.value||''}}));
    loadPublicSpotlight();
    grid.innerHTML=publicFields.map(f=>{const q=encodeURIComponent((f.latitude!=null&&f.longitude!=null)?`${f.latitude},${f.longitude}`:f.address||f.name);const mapSrc=`https://www.google.com/maps?q=${q}&output=embed`;const url=/^https:\/\//i.test(f.google_maps_url||"")?f.google_maps_url:"";return `<article class="field-card ${f.is_main?'main-field-card':''}"><iframe title="Map for ${escapeHtml(f.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${mapSrc}"></iframe><div class="field-card-copy"><span class="event-type">${f.is_main?'MAIN FIELD':'FIELDZERO NETWORK'}</span><h3>${escapeHtml(f.name)}</h3><p>${escapeHtml(f.address||"Address to be announced")}</p><small class="field-deposit-rate">Fixed booking advance: LKR 500 · Balance and extras paid at checkout</small><div class="field-card-actions">${url?`<a class="button button-lime" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">OPEN IN GOOGLE MAPS ↗</a>`:""}</div></div></article>`}).join("");
    if(dateInput)loadArenaSlots();
  }

  let publicEvents = [];
  function renderUpcomingEvents() {
    const filter = $("#eventsFieldFilter")?.value || 'all';
    const rows = publicEvents.filter(e => filter === 'all' || e.field_id === filter);
    if (!rows.length) { $("#eventsGrid").innerHTML = '<div class="empty-state">No upcoming events are listed for this field yet.</div>'; return; }
    $("#eventsGrid").innerHTML = rows.slice(0,8).map(e => {
      const date = e.event_date ? new Date(e.event_date + "T12:00:00").toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"}) : "DATE TBA";
      const fieldName = fieldNames.get(e.field_id) || e.location || "FIELDZERO FIELD";
      return `<article class="event-card"><span class="event-type">${escapeHtml((e.event_type || "SESSION").toUpperCase())}</span><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.description || "Details will be announced by the organiser.")}</p><div class="event-meta"><span>▣ ${escapeHtml(date)}</span><span>⌖ ${escapeHtml(fieldName)}</span></div><strong class="event-price">${Number(e.price_amount||0)===0?"PRICE TO BE CONFIRMED":`${escapeHtml(e.price_currency||"LKR")} ${Number(e.price_amount||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2})}`}</strong>${e.google_maps_url?`<a class="event-map-link" href="${escapeAttr(e.google_maps_url)}" target="_blank" rel="noopener noreferrer">OPEN FIELD MAP ↗</a><br><br>`:""}<a class="button button-lime event-book-link" href="event.html?id=${encodeURIComponent(e.id)}">${e.event_type === "Tournament" ? "REGISTER TEAM ↗" : "BOOK SESSION ↗"}</a></article>`;
    }).join("");
  }
  async function loadEvents() {
    if (!db) { eventPopupReady = true; maybeShowAnnouncement(); return; }
    const todaySL = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const { data, error } = await db.from("public_events").select("id,title,event_type,event_date,start_time,end_time,description,location,price_amount,price_currency,field_id,field_address,google_maps_url,popup_featured").or(`event_date.gte.${todaySL},event_date.is.null`).order("event_date", {ascending:true,nullsFirst:false}).limit(100);
    if (error) { $("#eventsGrid").innerHTML = '<div class="empty-state">Could not load events right now.</div>'; eventPopupReady = true; maybeShowAnnouncement(); return; }
    publicEvents = (data || []).filter(e => !e.event_date || e.event_date >= todaySL).sort((a,b) => { if (!a.event_date) return 1; if (!b.event_date) return -1; return a.event_date.localeCompare(b.event_date); });
    featuredEventForPopup = publicEvents.find(e => e.popup_featured && e.event_date && e.event_date >= todaySL) || publicEvents.find(e => e.popup_featured && !e.event_date) || null;
    eventPopupReady = true;
    fillBookingEvents(publicEvents);
    renderUpcomingEvents();
    maybeShowAnnouncement();
  }
  $("#eventsFieldFilter")?.addEventListener('change', renderUpcomingEvents);
  $("#galleryFieldFilter")?.addEventListener('change', renderGallery);

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
    if (!db) { status(statusEl, "Registration is not live yet. Please try again later.", "error"); return; }
    const fd = new FormData(form);
    const realName = String(fd.get("realName") || "").trim();
    const callsign = String(fd.get("callsign") || "").trim().replace(/\s+/g, " ");
    const mobile = String(fd.get("mobile") || "").trim();
    const email = String(fd.get("memberEmail") || "").trim();
    const password = String(fd.get("memberPassword") || "");
    if (fd.get("consent") !== "on" || realName.length < 2 || !/^[A-Za-z0-9_-]{3,24}$/.test(callsign) || mobile.length < 7 || !email || password.length < 8) {
      status(statusEl, "Check your details. Username must be 3–24 letters, numbers or underscores; password must be at least 8 characters.", "error"); return;
    }
    submit.disabled = true; submit.textContent = "CREATING OPERATOR ACCOUNT…";
    const { data, error } = await db.auth.signUp({
      email, password,
      options: { data: {
        fz_member_signup: "true", real_name: realName, callsign, username: callsign.toLowerCase(), mobile,
        primary_blaster: fd.get("gun"), team_preference: fd.get("teamPreference"),
        play_style: fd.get("playStyle")
      }, emailRedirectTo: `${location.origin}${location.pathname}#memberArea` }
    });
    submit.disabled = false; submit.innerHTML = "CREATE OPERATOR ACCOUNT <span>↗</span>";
    if (error || (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
      const message = error?.message?.toLowerCase().includes("already registered") || data?.user?.identities?.length === 0
        ? "This email may already have an account. Try signing in or use password reset."
        : (error?.message || "We could not create your account. Check the details and try again.");
      status(statusEl, message, "error"); return;
    }
    pendingOperatorEmail = email;
    form.reset();
    if (data.session) {
      status(statusEl, "Account created and player application submitted. Check your email if verification is requested. Your public profile will appear after admin approval.", "success");
      await loadMemberAccount();
    } else {
      status(statusEl, "REGISTRATION RECEIVED. Open the verification email sent to " + email + ". After confirming your email, return here and sign in. Your application is waiting for admin review.", "success");
    }
  });


  $("#resendOperatorConfirmation")?.addEventListener("click", async () => {
    const email = pendingOperatorEmail || String(prompt("Enter the private email address used during OPERATOR REGISTRATION:") || "").trim();
    if (!email) { status($("#formStatus"), "Enter the email address used during registration.", "error"); return; }
    const button = $("#resendOperatorConfirmation"); button.disabled = true; button.textContent = "SENDING…";
    const { error } = await db.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${location.origin}${location.pathname}#memberArea` } });
    button.disabled = false; button.textContent = "RESEND VERIFICATION EMAIL ↗";
    status($("#formStatus"), error ? `Could not resend verification email: ${error.message}` : `A new verification email has been requested for ${email}. Check Spam/Junk too.`, error ? "error" : "success");
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
    if(db){const from=slDateTime(date,0).toISOString(),to=slDateTime(date,23,59).toISOString();const {data,error}=await db.from("public_arena_bookings").select("booking_start,booking_end,status,player_count,field_id").eq("field_id",$("#arenaFieldSelect")?.value||"").gte("booking_start",from).lte("booking_start",to);if(!error)rows=data||[];}
    const dur=Number($("#arenaDuration").value||1), options=[];
    grid.innerHTML=hours.map(h=>{const start=slDateTime(date,h),end=new Date(start.getTime()+dur*3600000);const overlap=rows.find(r=>new Date(r.booking_start)<end&&new Date(r.booking_end)>start);const outside=dur>1&&!hours.includes(h+dur-1);const state=outside?'closed':overlap?(overlap.status==='approved'?'booked':'pending'):'free';if(state==='free')options.push({value:String(h),label:`${String(h).padStart(2,'0')}:00`});const label=state==='free'?'AVAILABLE':state==='pending'?'DEPOSIT HOLD':state==='booked'?'BOOKED':'CLOSED';return `<button type="button" class="arena-slot ${state}" data-hour="${h}" ${state!=='free'?'disabled':''}><b>${String(h).padStart(2,'0')}:00</b><small>${label}</small></button>`}).join('')||'<div class="empty-state">No regular opening hours on this date. Use a special booking request for an alternative time.</div>';
    select.innerHTML='<option value="">Choose an available start time…</option>'+options.map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
    grid.querySelectorAll('[data-hour]').forEach(b=>b.addEventListener('click',()=>{select.value=b.dataset.hour;select.scrollIntoView({behavior:'smooth',block:'center'});}));
  }
  if(dateInput){dateInput.addEventListener('change',loadArenaSlots);$("#arenaDuration").addEventListener('change',loadArenaSlots);loadArenaSlots();}
  const specialToggle=$("#specialRequest"); if(specialToggle) specialToggle.addEventListener("change",()=>{const slot=$("#arenaStartTime");slot.required=specialToggle.value!=="true";});
  async function generateCustomerBookingPdf(b){
    if(!window.jspdf?.jsPDF)throw new Error('PDF library unavailable');
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a4'});
    const dark=[15,22,17],lime=[185,255,64],muted=[101,113,101],light=[241,245,237],line=[218,225,214];
    const money=n=>'LKR '+Number(n||0).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2});
    const fmt=d=>new Date(d).toLocaleString('en-GB',{timeZone:'Asia/Colombo',dateStyle:'medium',timeStyle:'short'});
    doc.setFillColor(...dark);doc.rect(0,0,210,59,'F');doc.setFillColor(...lime);doc.rect(0,0,4,59,'F');
    doc.setFillColor(...lime);doc.roundedRect(14,13,24,24,2,2,'F');doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text('FZ',20,29);
    doc.setTextColor(255,255,255);doc.setFontSize(16);doc.text('FIELDZERO',45,22);doc.setFontSize(7);doc.setTextColor(...lime);doc.text('OWN THE FIELD. BUILD YOUR SQUAD.',45,29);
    doc.setTextColor(255,255,255);doc.setFontSize(15);doc.text('ADVANCE PAYMENT REQUEST',196,19,{align:'right'});doc.setFontSize(7);doc.setTextColor(206,216,202);doc.text('RESERVATION · NOT YET CONFIRMED',196,27,{align:'right'});
    doc.setTextColor(206,216,202);doc.setFontSize(7);doc.text('BOOKING REFERENCE',14,48);doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(String(b.booking_reference||'FZ-BOOKING'),14,54);

    doc.setFillColor(...lime);doc.roundedRect(14,70,182,38,3,3,'F');
    doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(7);doc.text('ADVANCE REQUIRED TO SECURE YOUR BOOKING',21,80);
    doc.setFontSize(23);doc.text(money(500),21,96);
    doc.setFontSize(7);doc.text('PAY LKR 500.00',188,84,{align:'right'});doc.setFont('helvetica','normal');doc.text('Booking confirms only after the field verifies payment.',188,92,{align:'right'});

    doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('BOOKING DETAILS',14,122);doc.setDrawColor(...line);doc.line(14,126,196,126);
    const rows=[
      ['CUSTOMER',`${b.real_name||''} · ${b.callsign||''}`],
      ['WHATSAPP / MOBILE',String(b.mobile||'')],
      ['FIELD',String(b.field_name||'FIELDZERO FIELD')],
      ['DATE & TIME',fmt(b.booking_start)],
      ['END TIME',fmt(b.booking_end)],
      ['EXPERIENCE',`${b.experience||'Field session'} · ${Number(b.player_count||1)} player(s)`],
      ['REQUEST TYPE',b.special_request?'SPECIAL REQUEST · FIELD REVIEW REQUIRED':'STANDARD BOOKING REQUEST']
    ];
    let y=137;
    rows.forEach((r,i)=>{
      if(i%2===0){doc.setFillColor(...light);doc.roundedRect(14,y-6,182,12,1,1,'F');}
      doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(...muted);doc.text(r[0],19,y+1);
      doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(...dark);doc.text(doc.splitTextToSize(String(r[1]),116),78,y+1);
      y+=14;
    });
    doc.setFillColor(...dark);doc.roundedRect(14,244,182,30,2,2,'F');
    doc.setTextColor(...lime);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('HOW TO PAY THE LKR 500 ADVANCE',20,254);
    doc.setTextColor(255,255,255);doc.setFont('helvetica','normal');doc.setFontSize(6.8);
    const paymentText=b.special_request? 'SPECIAL REQUEST: Please wait for the field admin to approve availability before paying. The LKR 500 advance becomes due only after acceptance. The field will confirm the payment instructions with you.':(String(b.payment_instructions||'').trim()||'Payment instructions have not been published for this field. Contact the field admin and quote your booking reference before making payment.');
    const paymentLines=doc.splitTextToSize(paymentText.slice(0,360),168).slice(0,3);
    doc.text(paymentLines,20,262);
    if(b.payment_contact_phone){doc.setTextColor(...lime);doc.setFont('helvetica','bold');doc.setFontSize(6.3);doc.text(`FIELD CONTACT: ${String(b.payment_contact_phone).slice(0,32)}`,20,271);}
    doc.setTextColor(...muted);doc.setFontSize(6.5);doc.text('IMPORTANT: This is a payment request only. It is not an invoice, proof of payment or confirmed booking. Your booking is confirmed only after the field admin verifies and records the LKR 500 advance.',14,283,{maxWidth:182});
    doc.setDrawColor(...lime);doc.setLineWidth(1);doc.line(14,289,196,289);
    doc.setFontSize(6);doc.text('FIELDZERO · SRI LANKA · KEEP THIS REFERENCE FOR CHECK-IN',14,294);
    doc.save(`${b.booking_reference||'FIELDZERO-BOOKING'}-ADVANCE-REQUEST.pdf`);
  }
  async function loadPublicSpotlight(){
    if(!db)return;
    const fieldId=$('#arenaFieldSelect')?.value||'';
    const modal=$('#fzSpotlightModal');
    if(!fieldId||!modal||sessionStorage.getItem('fzSpotlightSeen'))return;
    const {data,error}=await db.from('fz_spotlight_cards')
      .select('title,subtitle,image_url,card_type')
      .eq('field_id',fieldId)
      .eq('active',true)
      .order('created_at',{ascending:false})
      .limit(1);
    if(error||!data?.length)return;
    const card=data[0];
    $('#fzSpotlightTitle').textContent=card.title;
    $('#fzSpotlightSubtitle').textContent=card.subtitle||'';
    $('#fzSpotlightKicker').textContent=card.card_type==='top_player'?'FIELDZERO / PLAYER OF THE MOMENT':card.card_type==='special_occasion'?'FIELDZERO / SPECIAL OCCASION':'FIELDZERO / SPOTLIGHT';
    $('#fzSpotlightImage').style.backgroundImage=`url("${String(card.image_url).replace(/"/g,'%22')}")`;
    modal.hidden=false;
    sessionStorage.setItem('fzSpotlightSeen','1');
  }
  $('#arenaFieldSelect')?.addEventListener('change',()=>loadPublicSpotlight());
  $('#fzSpotlightClose')?.addEventListener('click',()=>{$('#fzSpotlightModal').hidden=true});
  const arenaForm=$("#arenaBookingForm"); if(arenaForm) arenaForm.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(arenaForm),el=$("#arenaBookingStatus");if(!db){status(el,'Database is not configured yet.','error');return}const h=fd.get('startTime'),special=fd.get('specialRequest')==='true',specialTime=String(fd.get('specialTime')||'');if(!h&&!special){status(el,'Choose an available start time or select special booking request.','error');return}const date=dateInput.value;const parts=(special&&specialTime)?specialTime.split(':').map(Number):[Number(h||15),0];const start=slDateTime(date,parts[0],parts[1]||0);const end=new Date(start.getTime()+Number($("#arenaDuration").value||1)*3600000);if(!special&&!openingHours(date).includes(Number(h))){status(el,'That start time is outside regular opening hours. Select special request instead.','error');return}const payload={field_id:$("#arenaFieldSelect")?.value||null,real_name:String(fd.get('realName')).trim(),callsign:String(fd.get('callsign')).trim(),mobile:String(fd.get('mobile')).trim(),customer_email:String(fd.get('customerEmail')||'').trim(),experience:String(fd.get('experience')||''),booking_start:start.toISOString(),booking_end:end.toISOString(),player_count:Number(fd.get('playerCount')),special_request:special,notes:[fd.get('experience') ? `Experience: ${String(fd.get('experience')).trim()}` : '', String(fd.get('notes')||'').trim()].filter(Boolean).join(' | ').slice(0,700),privacy_consent:true};const btn=$("#submitArenaBooking");btn.disabled=true;btn.textContent='PROCESSING BOOKING…';const {data,error}=await db.rpc('fz_submit_arena_booking',{p_booking:payload});btn.disabled=false;btn.textContent='REQUEST SLOT & DEPOSIT DETAILS ↗';if(error){status(el,error.message||'Could not submit booking. Please try again.','error');return}const booking=data?.[0];if(!booking){status(el,'Booking submitted but reference could not be loaded. Contact FIELDZERO.','error');return}try{const infoQ=await db.rpc('fz_public_field_payment_instructions',{p_field_id:payload.field_id});const paymentInfo=Array.isArray(infoQ.data)?infoQ.data[0]||{}:{};await generateCustomerBookingPdf({...payload,...booking,...paymentInfo,field_name:paymentInfo.field_name||$("#arenaFieldSelect")?.selectedOptions?.[0]?.textContent||'FIELDZERO FIELD',advance_required:500});}catch(pdfErr){console.warn('Booking PDF generation failed',pdfErr);try{await generateCustomerBookingPdf({...payload,...booking,field_name:$("#arenaFieldSelect")?.selectedOptions?.[0]?.textContent||'FIELDZERO FIELD',advance_required:500});}catch(retryErr){console.warn('Booking PDF retry failed',retryErr)}}arenaForm.reset();dateInput.value=date;await loadArenaSlots();status(el,special?`SPECIAL REQUEST RECEIVED · ${booking.booking_reference}. The selected field must review your request. The required advance is LKR 500 once accepted.`:`BOOKING REQUEST RECEIVED · ${booking.booking_reference}. LKR 500 advance is required. Your booking is confirmed only after the field admin verifies and records the payment.`, 'success');});
  const profileForm=$("#profileSearchForm");if(profileForm)profileForm.addEventListener('submit',async e=>{e.preventDefault();const box=$("#playerProfile"),call=$("#profileCallsign").value.trim();if(!db){box.innerHTML='<div class="empty-state">Database is not configured.</div>';return}box.innerHTML='<div class="empty-state">Retrieving verified operator record…</div>';const {data,error}=await db.from('public_player_profiles').select('callsign,player_rank,player_points,playing_hours,matches_played,wins,preferred_role,joined_on,win_rate,team_name').ilike('callsign',call).maybeSingle();if(error||!data){box.innerHTML='<div class="empty-state">No approved player profile found for that callsign.</div>';return}const matches=Math.max(0,Number(data.matches_played)||0),wins=Math.max(0,Number(data.wins)||0),hours=Math.max(0,Number(data.playing_hours)||0);const achievements=[{name:'FIRST DEPLOYMENT',detail:'Complete your first verified match',earned:matches>=1,value:matches,target:1},{name:'FIELD REGULAR',detail:'Complete 10 verified matches',earned:matches>=10,value:matches,target:10},{name:'FIELD VETERAN',detail:'Complete 25 verified matches',earned:matches>=25,value:matches,target:25},{name:'FIRST VICTORY',detail:'Record your first verified win',earned:wins>=1,value:wins,target:1},{name:'TEN WINS',detail:'Record 10 verified wins',earned:wins>=10,value:wins,target:10},{name:'TIME ON FIELD',detail:'Record 10 verified playing hours',earned:hours>=10,value:hours,target:10}];const earned=achievements.filter(a=>a.earned).length;box.innerHTML=`<article class="profile-card"><div class="profile-card-topline"><span>FIELDZERO / OPERATOR DOSSIER</span><span>RECORD VERIFIED</span></div><div class="profile-call">${escapeHtml(data.callsign)}</div><div class="profile-sub">${escapeHtml(data.team_name||'INDEPENDENT')} · ${escapeHtml(data.player_rank)}</div><div class="profile-stats"><div><b>${Number(data.player_points)}</b><span>POINTS</span></div><div><b>${hours.toFixed(1)}</b><span>PLAY HOURS</span></div><div><b>${matches}</b><span>MATCHES</span></div><div><b>${wins}</b><span>WINS</span></div><div><b>${Number(data.win_rate)||0}%</b><span>WIN RATE</span></div><div><b>${escapeHtml(data.preferred_role||'All-rounder')}</b><span>ROLE</span></div></div><div class="profile-achievement-head"><div><span>OPERATOR MILESTONES</span><b>${earned} / ${achievements.length} UNLOCKED</b></div><p>Milestones are calculated from admin-maintained match and attendance records.</p></div><div class="profile-achievements">${achievements.map(a=>`<div class="profile-achievement ${a.earned?'earned':'locked'}"><span class="achievement-mark">${a.earned?'✦':'◇'}</span><div><b>${a.name}</b><small>${a.detail}</small></div><span class="achievement-state">${a.earned?'EARNED':'LOCKED'}</span></div>`).join('')}</div><div class="profile-card-footer"><small>Roster since ${escapeHtml(data.joined_on||'—')} · Statistics maintained by FIELDZERO admin.</small><button class="button button-lime" id="shareOperatorRecord" type="button">SHARE OPERATOR RECORD ↗</button></div></article>`;const shareButton=box.querySelector('#shareOperatorRecord');shareButton?.addEventListener('click',async()=>{const shareText=`FIELDZERO / OPERATOR RECORD\n\n${data.callsign} · ${data.player_rank}\n${data.team_name||'Independent Operator'}\n${matches} matches · ${wins} wins · ${hours.toFixed(1)} playing hours\n${earned}/${achievements.length} milestones earned\n\nOWN THE FIELD. BUILD YOUR SQUAD.\nhttps://auto-0.github.io/fieldzero-community/#playerlookup`;try{if(navigator.share){await navigator.share({title:'FIELDZERO Operator Record',text:shareText});}else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(shareText);shareButton.textContent='COPIED TO CLIPBOARD ✓';}else{window.prompt('Copy your FIELDZERO operator record:',shareText);}}catch(err){if(err?.name!=='AbortError')console.warn('[FIELDZERO] Share failed:',err);}});});
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
  const leaderForm=$('#leaderForm');if(leaderForm){leaderForm.innerHTML='<div class="empty-state">Squad members can request captain status from their FIELDZERO Operator Account. The central admin will organise a YES / NO WhatsApp group poll before approval.</div>'; }
  $('#challengingTeam')?.addEventListener('change',()=>{const own=$('#challengingTeam').value,opponent=$('#challengedTeam');if(opponent&&opponent.value===own)opponent.value='';if(opponent)Array.from(opponent.options).forEach(o=>{o.disabled=!!own&&o.value===own;});});
  const challengeForm=$('#challengeForm');if(challengeForm)challengeForm.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(challengeForm),el=$('#challengeStatus');if(!db){status(el,'Database is not configured.','error');return}if(fd.get('challengingTeam')===fd.get('challengedTeam')){status(el,'Choose two different squads.','error');return}const {error}=await db.from('team_challenges').insert({challenging_team_id:fd.get('challengingTeam'),challenged_team_id:fd.get('challengedTeam'),leader_callsign:String(fd.get('leaderCallsign')).trim(),leader_mobile:String(fd.get('leaderMobile')).trim(),proposed_format:fd.get('format'),proposed_date:fd.get('proposedDate')||null,message:String(fd.get('message')||'').trim()});status(el,error?'Could not submit challenge. Check V2 migration and choose an active squad.':'Challenge sent to FIELDZERO admin for review. The admin must contact the challenged team leader; this starter does not send automatic WhatsApp/push alerts.',error?'error':'success');if(!error)challengeForm.reset();});

  if (!db) { notConfigured(); loadFields(); }
  else Promise.all([loadRoster(), loadTeams(), loadEvents(), loadFields()]);

  // V21.2 public leaderboard: public-safe views only. Squad visibility is
  // derived from active approved membership by the V21.2 SQL migration.
  let currentBoard = "players";
  async function loadLeaderboard(board = currentBoard) {
    currentBoard = board === "teams" ? "teams" : "players";
    const target = $("#leaderboardTable");
    if (!target) return;
    document.querySelectorAll("[data-board]").forEach(button => {
      button.classList.toggle("active", button.dataset.board === currentBoard);
      button.setAttribute("aria-pressed", button.dataset.board === currentBoard ? "true" : "false");
    });

    if (!db) {
      target.innerHTML = '<div class="empty-state">The FIELDZERO database is not connected. Rankings are temporarily unavailable.</div>';
      return;
    }

    const isTeams = currentBoard === "teams";
    const view = isTeams ? "public_teams" : "public_player_profiles";
    const columns = isTeams
      ? "id,name,team_rank,points,member_count"
      : "callsign,player_rank,player_points,matches_played,wins";

    target.setAttribute("aria-live", "polite");
    target.innerHTML = '<div class="empty-state">Loading ' + (isTeams ? 'squad' : 'operator') + ' rankings…</div>';

    try {
      let query = db.from(view).select(columns).order(isTeams ? "points" : "player_points", { ascending: false });
      if (isTeams) query = query.order("team_rank", { ascending: true }).order("name", { ascending: true });
      const { data, error } = await query.limit(10);

      if (error) {
        console.error("[FIELDZERO] Public leaderboard query failed:", { view, code: error.code, message: error.message, details: error.details });
        target.innerHTML = '<div class="empty-state">' + (isTeams
          ? 'Squad rankings could not be loaded. The administrator should apply the V21.2 public squad leaderboard SQL repair and confirm public view access.'
          : 'Operator rankings could not be loaded. Please try again later.') + '</div>';
        return;
      }

      if (!Array.isArray(data) || data.length === 0) {
        target.innerHTML = '<div class="empty-state">' + (isTeams
          ? 'No public squads yet. A squad appears here when it has 1–5 active approved operators. Ask an admin to check squad membership.'
          : 'No verified operator scores yet. Rankings appear after the admin records results and points.') + '</div>';
        return;
      }

      const rankCard = (row, index, podium = false) => {
        const name = isTeams ? row.name : row.callsign;
        const points = Number(isTeams ? row.points : row.player_points) || 0;
        const safeName = escapeHtml(name || (isTeams ? "UNNAMED SQUAD" : "UNKNOWN OPERATOR"));
        const subtitle = isTeams
          ? `${Number(row.member_count) || 0}/5 ACTIVE OPERATORS · SQUAD RANK #${Number(row.team_rank) || index + 1}`
          : `${escapeHtml(row.player_rank || "ROOKIE")} · ${Number(row.matches_played) || 0} MATCHES · ${Number(row.wins) || 0} WINS`;
        const rank = index + 1;
        const medal = rank === 1 ? "CHAMPION" : rank === 2 ? "RUNNER-UP" : "THIRD PLACE";
        return podium
          ? `<article class="leaderboard-podium-card podium-place-${rank}">
              <div class="podium-card-top"><span class="podium-medal" aria-label="${medal}">${rank === 1 ? "★" : rank === 2 ? "◆" : "▲"}</span><span class="podium-position">0${rank} / ${medal}</span></div>
              <div class="leaderboard-name">${safeName}</div><span class="leaderboard-sub">${subtitle}</span>
              <div class="podium-score">${points.toLocaleString()}<small>POINTS</small></div>
              <button class="leaderboard-share" type="button" data-share-rank="${rank}" data-share-name="${escapeAttr(name || "FIELDZERO PLAYER")}" data-share-points="${points}" data-share-board="${isTeams ? "squad" : "operator"}">SHARE RESULT ↗</button>
            </article>`
          : `<div class="leaderboard-row">
              <div class="leaderboard-rank">${String(rank).padStart(2, "0")}</div>
              <div><div class="leaderboard-name">${safeName}</div><span class="leaderboard-sub">${subtitle}</span></div>
              <div class="leaderboard-points">${points.toLocaleString()}<small>POINTS</small></div>
              <button class="leaderboard-share" type="button" data-share-rank="${rank}" data-share-name="${escapeAttr(name || "FIELDZERO PLAYER")}" data-share-points="${points}" data-share-board="${isTeams ? "squad" : "operator"}" aria-label="Share ranking for ${safeName}">↗</button>
            </div>`;
      };
      const podium = data.slice(0, 3).map((row, index) => rankCard(row, index, true)).join("");
      const remaining = data.slice(3).map((row, index) => rankCard(row, index + 3, false)).join("");
      target.innerHTML = `<div class="leaderboard-podium">${podium}</div>${remaining ? `<div class="leaderboard-rest">${remaining}</div>` : ""}`;
      target.querySelectorAll("[data-share-rank]").forEach(button => {
        button.addEventListener("click", async () => {
          const shareText = `FIELDZERO ${button.dataset.shareBoard.toUpperCase()} RANKING\n#${button.dataset.shareRank} — ${button.dataset.shareName}\n${Number(button.dataset.sharePoints).toLocaleString()} POINTS\nOWN THE FIELD. BUILD YOUR SQUAD.\nhttps://auto-0.github.io/fieldzero-community/#leaderboards`;
          try {
            if (navigator.share) await navigator.share({ title: "FIELDZERO Field Records", text: shareText });
            else if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(shareText);
              button.textContent = "COPIED ✓";
            }
          } catch (shareError) {
            if (shareError?.name !== "AbortError") console.warn("[FIELDZERO] Share action unavailable:", shareError);
          }
        });
      });
    } catch (error) {
      console.error("[FIELDZERO] Unexpected leaderboard error:", error);
      target.innerHTML = '<div class="empty-state">Rankings could not be loaded right now. Please refresh the page.</div>';
    }
  }

  document.querySelectorAll("[data-board]").forEach(button => {
    button.addEventListener("click", () => loadLeaderboard(button.dataset.board));
  });
  loadLeaderboard();

  // Public, immediately published feedback. Display names are optional; no contact details are collected.
  const feedbackForm=$('#feedbackForm');
  let allPublicFeedback=[];
  function renderFeedback(){
    const list=$('#feedbackList'), summary=$('#feedbackSummary'); if(!list||!summary)return;
    const selected=$('#feedbackFieldFilter')?.value||'all';
    const rows=allPublicFeedback.filter(r=>selected==='all'||r.field_id===selected);
    const avg=rows.length?rows.reduce((a,r)=>a+Number(r.rating||0),0)/rows.length:0;
    summary.textContent=rows.length?`★ ${avg.toFixed(1)} / 5 · ${rows.length} RECENT`:'NO RATINGS YET';
    list.innerHTML=rows.length?rows.slice(0,12).map(r=>`<article class="feedback-card"><div class="feedback-card-top"><b>${escapeHtml(r.display_name||'FIELDZERO PLAYER')}</b><span class="feedback-stars" aria-label="${Number(r.rating)} out of 5 stars">${'★'.repeat(Math.max(0,Math.min(5,Number(r.rating)||0)))}${'☆'.repeat(5-Math.max(0,Math.min(5,Number(r.rating)||0)))}</span></div><p>${escapeHtml(r.comment)}</p><small>${escapeHtml(fieldNames.get(r.field_id)||'FIELDZERO FIELD')} · ${new Date(r.created_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}</small></article>`).join(''):'<div class="empty-state">No feedback has been published for this field yet.</div>';
  }
  async function loadFeedback(){
    const list=$('#feedbackList'), summary=$('#feedbackSummary'); if(!list||!summary)return;
    if(!db){list.innerHTML='<div class="empty-state">Feedback will appear after the site database is configured.</div>';summary.textContent='DATABASE OFFLINE';return;}
    const {data,error}=await db.from('public_feedback').select('id,display_name,rating,comment,created_at,field_id').order('created_at',{ascending:false}).limit(100);
    if(error){list.innerHTML='<div class="empty-state">Feedback could not load. The site owner should apply upgrade-v6.sql.</div>';summary.textContent='UNAVAILABLE';return;}
    allPublicFeedback=data||[];renderFeedback();
  }
  $('#feedbackFieldFilter')?.addEventListener('change',renderFeedback);
  document.querySelectorAll('.star-picker input[type="radio"]').forEach(radio=>radio.addEventListener('change',()=>{const group=radio.closest('.star-picker');group?.querySelectorAll('label').forEach(label=>label.classList.toggle('selected',Number(label.querySelector('input').value)<=Number(radio.value)));}));
  if(feedbackForm)feedbackForm.addEventListener('submit',async e=>{
    e.preventDefault();const el=$('#feedbackStatus'),button=$('#submitFeedback'),fd=new FormData(feedbackForm);
    if(!db){status(el,'Feedback is unavailable until the site database is configured.','error');return;}
    const rating=Number(fd.get('rating')),comment=String(fd.get('comment')||'').trim(),display_name=String(fd.get('displayName')||'').trim().slice(0,32);
    if(!(rating>=1&&rating<=5)){status(el,'Please select a star rating from 1 to 5.','error');return;}
    if(comment.length<5){status(el,'Please add a little more detail (at least 5 characters).','error');return;}
    button.disabled=true;const {error}=await db.from('feedback').insert({field_id:fd.get('field_id'),display_name:display_name||'FIELDZERO PLAYER',rating,comment,published:true});button.disabled=false;
    if(error){status(el,'Could not publish feedback. The site owner should apply upgrade-v6.sql and check database permissions.','error');return;}
    feedbackForm.reset();const fbField=$('#feedbackFieldSelect');if(fbField)fbField.value=publicFields.find(f=>f.is_main)?.id||publicFields[0]?.id||'';document.querySelectorAll('.star-picker label').forEach(label=>label.classList.remove('selected'));status(el,'Thanks — your feedback is now published. Please keep comments respectful.','success');await loadFeedback();
  });
  loadFeedback();

  // Session gallery: admin-uploaded public photos with lightbox and optional featured pop-up.
  const galleryGrid=$('#galleryGrid'), galleryCount=$('#galleryCount'), lightbox=$('#photoLightbox');
  let galleryPhotos=[], allGalleryPhotos=[], lightboxIndex=0;
  function renderGallery(){
    if(!galleryGrid||!galleryCount)return;
    const filter=$('#galleryFieldFilter')?.value||'all';
    galleryPhotos=allGalleryPhotos.filter(photo=>filter==='all'||photo.field_id===filter);
    galleryCount.textContent=`${galleryPhotos.length} SESSION PHOTO${galleryPhotos.length===1?'':'S'}`;
    if(!galleryPhotos.length){galleryGrid.innerHTML='<div class="empty-state gallery-empty">No session photos have been published yet. FIELDZERO highlights will appear here after the first gallery upload.</div>';return;}
    galleryGrid.innerHTML=galleryPhotos.map((photo,i)=>`<button type="button" class="gallery-card" data-gallery-index="${i}" aria-label="View ${escapeAttr(photo.title||'session photo')}"><img src="${escapeAttr(photo.image_url)}" alt="${escapeAttr(photo.title||'FIELDZERO session photo')}" loading="lazy"><span class="gallery-open-mark">↗</span><span class="gallery-card-copy"><small>${escapeHtml(photo.session_name||'FIELDZERO SESSION')}</small><b>${escapeHtml(photo.title||'FIELD MOMENT')}</b></span></button>`).join('');
    galleryGrid.querySelectorAll('[data-gallery-index]').forEach(button=>button.addEventListener('click',()=>openLightbox(Number(button.dataset.galleryIndex))));
  }
  async function loadGallery(){
    if(!galleryGrid)return;
    if(!db){galleryGrid.innerHTML='<div class="empty-state gallery-empty">Connect the FIELDZERO database to load session photos.</div>';if(galleryCount)galleryCount.textContent='GALLERY OFFLINE';galleryPopupReady=true;maybeShowAnnouncement();return;}
    const {data,error}=await db.from('public_gallery_photos').select('id,title,session_name,image_url,popup_featured,created_at,field_id').order('created_at',{ascending:false});
    if(error){galleryGrid.innerHTML='<div class="empty-state gallery-empty">The gallery database is not ready yet. The site owner should run supabase/upgrade-v7-gallery.sql.</div>';galleryCount.textContent='GALLERY UNAVAILABLE';galleryPopupReady=true;maybeShowAnnouncement();return;}
    allGalleryPhotos=data||[];renderGallery();
    featuredPhotoForPopup=allGalleryPhotos.find(photo=>photo.popup_featured)||null;
    galleryPopupReady=true;
    maybeShowAnnouncement();
  }
  function openLightbox(index){if(!galleryPhotos.length)return;lightboxIndex=(index+galleryPhotos.length)%galleryPhotos.length;const photo=galleryPhotos[lightboxIndex];$('#lightboxImage').src=photo.image_url;$('#lightboxImage').alt=photo.title||'FIELDZERO session photo';$('#lightboxCaption').textContent=`${photo.session_name||'FIELDZERO SESSION'} / ${photo.title||'FIELD MOMENT'} · ${lightboxIndex+1} OF ${galleryPhotos.length}`;lightbox.hidden=false;document.body.style.overflow='hidden';}
  function closeLightbox(){lightbox.hidden=true;document.body.style.overflow='';$('#lightboxImage').src='';}
  $('#lightboxClose')?.addEventListener('click',closeLightbox);$('#lightboxPrev')?.addEventListener('click',()=>openLightbox(lightboxIndex-1));$('#lightboxNext')?.addEventListener('click',()=>openLightbox(lightboxIndex+1));
  lightbox?.addEventListener('click',e=>{if(e.target===lightbox)closeLightbox()});
  function closeFeaturedPopup(){const popup=$('#featuredPopup');popup.hidden=true;document.body.style.overflow='';}
  $('#featuredPopupClose')?.addEventListener('click',closeFeaturedPopup);$('#featuredPopupView')?.addEventListener('click',()=>{closeFeaturedPopup();location.hash='#gallery'});
  $('#featuredPopup')?.addEventListener('click',e=>{if(e.target.id==='featuredPopup')closeFeaturedPopup()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(lightbox&&!lightbox.hidden)closeLightbox();if(!$('#featuredPopup').hidden)closeFeaturedPopup();if(announcementPopup&&!announcementPopup.hidden)closeAnnouncement();}else if(lightbox&&!lightbox.hidden&&e.key==='ArrowRight')openLightbox(lightboxIndex+1);else if(lightbox&&!lightbox.hidden&&e.key==='ArrowLeft')openLightbox(lightboxIndex-1)});

  // V18 — member account, profile, squad discovery and captain workflow.
  // Unified OPERATOR ACCOUNT: registration and login are tabs in one section.
  const operatorRegistrationForm = $('#registrationForm');
  const operatorLoginForm = $('#memberLoginForm');
  const operatorTabs = document.querySelector('.fz-operator-tabs');
  document.querySelectorAll('[data-operator-tab]').forEach(tab=>tab.addEventListener('click',()=>{
    const mode=tab.dataset.operatorTab;
    document.querySelectorAll('[data-operator-tab]').forEach(b=>{const active=b===tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
    if(operatorRegistrationForm) operatorRegistrationForm.hidden=mode!=='register';
    if(operatorLoginForm) operatorLoginForm.hidden=mode!=='login';
  }));

  const memberLoginForm = $('#memberLoginForm');
  let memberContext = null, memberSquads = [], pendingOperatorEmail = "";
  const memberMsg = (el, text, kind='') => { if(el) status(el,text,kind); };
  function memberStat(label,value){return `<div><b>${escapeHtml(value ?? '0')}</b><small>${escapeHtml(label)}</small></div>`;}
  async function loadMemberAccount(){
    if(!db || !$('#memberDashboard')) return;
    const {data:{session}} = await db.auth.getSession();
    if(!session){$('#memberLoginForm').hidden=false;$('#registrationForm').hidden=true;if(operatorTabs)operatorTabs.hidden=false;$('#memberDashboard').hidden=true;memberContext=null;return;}
    $('#memberLoginForm').hidden=true;$('#registrationForm').hidden=true;if(operatorTabs)operatorTabs.hidden=true;$('#memberDashboard').hidden=false;
    const {data,error}=await db.rpc('fz_member_get_context');
    if(error){memberMsg($('#memberLoginStatus'),`Operator profile service error: ${error.message||'Unknown database error'}. Ask admin to check V18/V21 migrations and RPC permissions.`,'error');return;}
    memberContext=data;
    if(data?.state==='pending'){
      const op=data.operator||{}; $('#memberWelcome').textContent=(op.callsign||'OPERATOR').toUpperCase(); $('#memberAccountStatus').textContent='APPLICATION RECEIVED · WAITING FOR EMAIL VERIFICATION / ADMIN REVIEW'; $('#memberRealName').textContent=(op.real_name||'NAME NOT AVAILABLE').toUpperCase(); $('#memberCallsignTag').textContent='CALLSIGN / '+(op.callsign||'—'); $('#memberRankTag').textContent='STATUS / PENDING'; $('#memberOperatorStatusTag').textContent='PENDING REVIEW'; $('#memberPrivateEmail').textContent=op.contact_email||'—'; $('#memberPrivateMobile').textContent=op.mobile||'—'; $('#memberBlaster').textContent=op.primary_blaster||'—'; $('#memberPlayStyle').textContent=op.play_style||'—'; $('#memberApplicationState').textContent='PENDING ADMIN REVIEW'; $('#memberStats').innerHTML='<p class="empty-state">Your operator application is in the FIELDZERO queue. Confirm your email, then wait for admin approval before your player statistics and squad access are activated.</p>'; $('#memberTeamInfo').textContent='Squad access unlocks after approval.'; $('#memberTeamActions').innerHTML=''; $('#memberSquadResults').innerHTML=''; return;
    }
    if(data?.state==='rejected'){const op=data.operator||{};$('#memberWelcome').textContent=(op.callsign||'OPERATOR').toUpperCase();$('#memberAccountStatus').textContent='APPLICATION NOT APPROVED · CONTACT FIELDZERO ADMIN';$('#memberRealName').textContent=(op.real_name||'OPERATOR').toUpperCase();$('#memberCallsignTag').textContent='CALLSIGN / '+(op.callsign||'—');$('#memberRankTag').textContent='STATUS / REVIEW REQUIRED';$('#memberOperatorStatusTag').textContent='REVIEW REQUIRED';$('#memberPrivateEmail').textContent=op.contact_email||'—';$('#memberApplicationState').textContent='REJECTED';$('#memberStats').innerHTML='<p class="empty-state">Your application was not approved. Contact FIELDZERO admin for clarification before submitting another application.</p>';$('#memberTeamInfo').textContent='Squad access is not active.';$('#memberTeamActions').innerHTML='';return;}
    if(data?.state==='not_linked'){
      $('#memberWelcome').textContent='ACCOUNT LINK REQUEST';$('#memberAccountStatus').textContent='Your existing player record is waiting for admin verification.';
      $('#memberStats').innerHTML='<p class="empty-state">Your operator profile and results will unlock after your application is approved or your existing profile is linked by an admin.</p>';
      $('#memberTeamInfo').textContent='Available after account approval.';$('#memberTeamActions').innerHTML='';$('#memberSquadResults').innerHTML='';return;
    }
    if(data?.state!=='active'){
      $('#memberWelcome').textContent='PROFILE INACTIVE';$('#memberAccountStatus').textContent='This account does not currently have an active FIELDZERO player profile. Contact the admin.';$('#memberStats').innerHTML='';return;
    }
    const p=data.player||{}, a=data.account||{}, team=data.team;
    const operator=data.operator||{};
    $('#memberWelcome').textContent=(a.display_name||p.callsign||'OPERATOR').toUpperCase();
    $('#memberRealName').textContent=(operator.real_name||a.display_name||'OPERATOR').toUpperCase(); $('#memberCallsignTag').textContent='CALLSIGN / '+(p.callsign||'—'); $('#memberRankTag').textContent='RANK / '+(p.player_rank||'ROOKIE'); $('#memberOperatorStatusTag').textContent='ACTIVE OPERATOR'; $('#memberPrivateEmail').textContent=operator.contact_email||'—'; $('#memberPrivateMobile').textContent=operator.mobile||'—'; $('#memberBlaster').textContent=operator.primary_blaster||'—'; $('#memberPlayStyle').textContent=operator.play_style||'—'; $('#memberApplicationState').textContent=operator.application_status||'APPROVED';
    $('#memberAccountStatus').textContent=team?`Active operator · ${team.name}${team.is_leader?' · Squad captain':''}`:'Active operator · Independent player';
    $('#memberCallsign').value=p.callsign||'';$('#memberDisplayName').value=a.display_name||'';
    const img=$('#memberAvatarPreview'), fallback=$('#memberAvatarFallback');
    if(a.avatar_url){img.src=a.avatar_url;img.hidden=false;fallback.hidden=true;}else{img.removeAttribute('src');img.hidden=true;fallback.hidden=false;fallback.textContent=(p.callsign||'FZ').slice(0,2).toUpperCase();}
    $('#memberStats').innerHTML=[memberStat('PLAYER POINTS',Number(p.player_points||0).toLocaleString()),memberStat('MATCHES',p.matches_played||0),memberStat('WINS',p.wins||0),memberStat('PLAY HOURS',Number(p.playing_hours||0).toFixed(1))].join('');
    $('#memberTeamInfo').innerHTML=team?`<b>${escapeHtml(team.name)}</b><p>${Number(team.member_count||0)}/5 members ${team.is_leader?'· YOU ARE CAPTAIN':''}</p>`:(data.pending_join?`<p>Join request pending for <b>${escapeHtml(data.pending_join.team_name||'a squad')}</b>. The squad captain must approve it.</p>`:'<p>You are currently an independent operator.</p>');
    $('#memberTeamActions').innerHTML=team?`<button class="button button-ghost" type="button" id="memberLeaveTeam">LEAVE SQUAD</button>${team.is_leader?'':` <button class="button button-ghost" type="button" id="memberRequestLeader">REQUEST CAPTAIN STATUS</button>`}`:'';
    $('#memberLeaveTeam')?.addEventListener('click',async()=>{if(!confirm('Leave your current squad? Your player results will remain.'))return;const {error}=await db.rpc('fz_member_leave_team');if(error){memberMsg($('#memberProfileStatus'),error.message,'error');return;}await loadMemberAccount();await loadTeams();});
    $('#memberRequestLeader')?.addEventListener('click',async()=>{const {data:{session}}=await db.auth.getSession();const mobile=prompt('Confirm your WhatsApp/mobile number for admin verification:');if(!mobile)return;const {error}=await db.rpc('fz_member_request_leader',{p_team_id:team.id,p_mobile:mobile,p_email:session?.user?.email||''});memberMsg($('#memberProfileStatus'),error?error.message:'Captain request sent to FIELDZERO admin. A YES / NO poll will be arranged in the community WhatsApp group.','success');});
    await loadMemberSquads();
    if(team?.is_leader) await loadMemberCaptainQueue(); else $('#memberCaptainQueue').innerHTML='';
  }
  async function loadMemberSquads(){
    const host=$('#memberSquadResults');if(!host||!db)return;
    const {data,error}=await db.from('public_teams').select('id,name,member_count,points,team_rank').order('team_rank').limit(100);
    if(error){host.innerHTML='<p class="empty-state">Squads are temporarily unavailable.</p>';return;}
    memberSquads=data||[];renderMemberSquads();
  }
  function renderMemberSquads(){
    const host=$('#memberSquadResults');if(!host)return;const q=($('#memberSquadSearch')?.value||'').trim().toLowerCase();
    const rows=memberSquads.filter(t=>t.name.toLowerCase().includes(q));
    host.innerHTML=rows.length?rows.map(t=>`<article class="fz-member-squad-row"><div><b>${escapeHtml(t.name)}</b><small>${Number(t.member_count||0)}/5 members · ${Number(t.points||0)} pts</small></div><button class="button button-ghost" type="button" data-request-team="${escapeAttr(t.id)}" ${Number(t.member_count)>=5?'disabled':''}>REQUEST TO JOIN</button></article>`).join(''):'<p class="empty-state">No matching squads found.</p>';
    host.querySelectorAll('[data-request-team]').forEach(btn=>btn.addEventListener('click',async()=>{const {error}=await db.rpc('fz_member_request_team',{p_team_id:btn.dataset.requestTeam});memberMsg($('#memberProfileStatus'),error?error.message:'Request sent. The squad captain must approve it.','success');btn.disabled=true;btn.textContent='REQUEST SENT';}));
  }
  async function loadMemberCaptainQueue(){
    const host=$('#memberCaptainQueue');if(!host)return;const {data,error}=await db.rpc('fz_member_get_team_join_requests');
    if(error){host.innerHTML='';return;}const rows=Array.isArray(data)?data:[];
    host.innerHTML=rows.length?`<h5>JOIN REQUESTS</h5>`+rows.map(r=>`<article class="fz-member-join-row"><b>${escapeHtml(r.callsign)}</b><small>Wants to join ${escapeHtml(r.team_name)}</small><div><button class="button button-lime" data-join-review="approve" data-id="${r.id}">APPROVE</button><button class="button button-ghost" data-join-review="reject" data-id="${r.id}">DECLINE</button></div></article>`).join(''):'<p class="fz-muted">No pending join requests.</p>';
    host.querySelectorAll('[data-join-review]').forEach(btn=>btn.addEventListener('click',async()=>{const {error}=await db.rpc('fz_member_review_team_join',{p_request_id:btn.dataset.id,p_decision:btn.dataset.joinReview});if(error){memberMsg($('#memberProfileStatus'),error.message,'error');return;}await loadMemberCaptainQueue();await loadMemberAccount();}));
  }
  memberLoginForm?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(memberLoginForm),btn=$('#memberLoginButton');const username=String(fd.get('username')||'').trim().toLowerCase(),password=String(fd.get('password')||'');if(!/^[a-z0-9_-]{3,24}$/.test(username)){memberMsg($('#memberLoginStatus'),'Enter your FIELDZERO username.','error');return;}btn.disabled=true;btn.textContent='SIGNING IN…';const {data,error}=await db.functions.invoke('member-login',{body:{username,password}});btn.disabled=false;btn.textContent='SIGN IN ↗';if(error||!data?.access_token||!data?.refresh_token){memberMsg($('#memberLoginStatus'),'Sign in failed. Check your username and password, then try again.','error');return;}const {error:setError}=await db.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});if(setError){memberMsg($('#memberLoginStatus'),'Login session could not be started. Please try again.','error');return;}memberMsg($('#memberLoginStatus'),'Signed in. Loading your profile…','success');await loadMemberAccount();});
  $('#memberRefresh')?.addEventListener('click',loadMemberAccount);
  $('#memberPasswordUpdate')?.addEventListener('submit',async e=>{e.preventDefault();const password=$('#memberNewPassword').value;if(password.length<8){memberMsg($('#memberPasswordStatus'),'Use at least 8 characters.','error');return;}const {error}=await db.auth.updateUser({password});if(error){memberMsg($('#memberPasswordStatus'),error.message,'error');return;}e.currentTarget.reset();e.currentTarget.hidden=true;memberMsg($('#memberLoginStatus'),'Your password has been updated.','success');});
  $('#memberSignOut')?.addEventListener('click',async()=>{await db.auth.signOut();memberMsg($('#memberLoginStatus'),'You have signed out.','success');await loadMemberAccount();});
  $('#memberForgotPassword')?.addEventListener('click',async()=>{const email=prompt('Enter the private email address used when you created your FIELDZERO account:');if(!email)return;const {error}=await db.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${location.origin}${location.pathname}#memberArea`});memberMsg($('#memberLoginStatus'),error?error.message:'If the address is registered, a password reset email will be sent. Check your inbox.',error?'error':'success');});
  $('#memberSquadSearch')?.addEventListener('input',renderMemberSquads);
  $('#memberProfileForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!db)return;const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;let avatarUrl=memberContext?.account?.avatar_url||'';const file=$('#memberAvatarFile').files[0];if(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){memberMsg($('#memberProfileStatus'),'Choose a JPG, PNG or WEBP image up to 5 MB.','error');btn.disabled=false;return;}const {data:{user}}=await db.auth.getUser();const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=`${user.id}/${crypto.randomUUID()}.${ext}`;const {error:uploadError}=await db.storage.from('fz-member-avatars').upload(path,file,{contentType:file.type,upsert:false});if(uploadError){memberMsg($('#memberProfileStatus'),uploadError.message,'error');btn.disabled=false;return;}avatarUrl=db.storage.from('fz-member-avatars').getPublicUrl(path).data.publicUrl;}
    const {error}=await db.rpc('fz_member_update_profile',{p_callsign:$('#memberCallsign').value.trim(),p_display_name:$('#memberDisplayName').value.trim(),p_avatar_url:avatarUrl});btn.disabled=false;if(error){memberMsg($('#memberProfileStatus'),error.message,'error');return;}memberMsg($('#memberProfileStatus'),'Profile saved.','success');await loadMemberAccount();await loadRoster();await loadTeams();});
  $('#memberDeleteProfile')?.addEventListener('click',async()=>{if(!confirm('Delete your public FIELDZERO profile and leave all squads? Historical verified match results will be retained.'))return;const {error}=await db.rpc('fz_member_delete_profile');if(error){memberMsg($('#memberProfileStatus'),error.message,'error');return;}await db.auth.signOut();memberMsg($('#memberLoginStatus'),'Your FIELDZERO profile has been deactivated. Historical results are retained.','success');await loadMemberAccount();await loadRoster();await loadTeams();});
  db?.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY' && $('#memberPasswordUpdate'))$('#memberPasswordUpdate').hidden=false;if(event==='SIGNED_IN' && session && location.hash.includes('memberArea')){memberMsg($('#memberLoginStatus'),'Email verified / session restored. Loading your operator dossier…','success');}if($('#memberDashboard'))setTimeout(()=>loadMemberAccount(),0);});

  loadSessionPrices();
  loadSiteSettings();
  loadSiteAppearance();
  loadSeasonalCampaigns();
  loadGallery();
})();
