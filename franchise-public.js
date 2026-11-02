/* FIELDZERO V15 - public franchise application and sponsor placements.
   Uses only the public Supabase key from config.js. Passwords are handled by Auth. */
(() => {
  'use strict';
  const cfg = window.FIELDZERO_CONFIG || {};
  const ready = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !String(cfg.SUPABASE_URL).includes('YOUR-PROJECT') &&
    !String(cfg.SUPABASE_ANON_KEY).includes('YOUR_SUPABASE'));
  const db = ready ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = s => document.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const setStatus = (node, message, kind='') => {
    if (!node) return;
    node.textContent = message;
    node.className = `form-status${kind ? ` ${kind}` : ''}`;
  };

  // Advertisements are shown only after the central admin has marked payment as paid/comped.
  const placements = {
    home_feature: '#adHomeFeature',
    events_inline: '#adEventsInline',
    footer_sponsor: '#adFooterSponsor'
  };
  let ads = [];
  let currentField = '';
  let fieldSelectionReady = false;
  async function loadAds() {
    if (!db) return;
    const { data, error } = await db.from('public_active_ads')
      .select('id,field_id,advertiser_name,title,description,image_url,destination_url,cta_label,placement,priority')
      .order('priority', { ascending: false }).limit(30);
    if (error) return; // No public interruption when the ad module is not configured.
    ads = data || [];
    renderAds();
  }
  function renderAds() {
    if (!fieldSelectionReady) { Object.values(placements).forEach(selector => { const host=$(selector); if(host) host.hidden=true; }); return; }
    Object.entries(placements).forEach(([placement, selector]) => {
      const host = $(selector);
      if (!host) return;
      const matching = ads.filter(ad => ad.placement === placement && (!ad.field_id || !currentField || ad.field_id === currentField));
      const ad = matching[0];
      if (!ad) { host.hidden = true; host.innerHTML = ''; return; }
      host.hidden = false;
      const image = ad.image_url ? `<img class="sponsor-image" src="${esc(ad.image_url)}" alt="${esc(ad.advertiser_name)} advertisement" loading="lazy">` : '';
      const cta = ad.destination_url ? `<a class="button button-lime sponsor-cta" href="${esc(ad.destination_url)}" target="_blank" rel="sponsored noopener noreferrer" data-ad-click="${esc(ad.id)}">${esc(ad.cta_label || 'LEARN MORE')} ↗</a>` : '';
      host.innerHTML = `<div class="sponsor-inner"><div class="sponsor-tag">SPONSORED</div>${image}<div class="sponsor-copy"><small>${esc(ad.advertiser_name || 'FIELDZERO PARTNER')}</small><h3>${esc(ad.title)}</h3><p>${esc(ad.description || '')}</p>${cta}</div></div>`;
      db.rpc('fz_track_ad', { p_ad_id: ad.id, p_action: 'impression' }).then(() => {}).catch(() => {});
      host.querySelector('[data-ad-click]')?.addEventListener('click', () => {
        db.rpc('fz_track_ad', { p_ad_id: ad.id, p_action: 'click' }).then(() => {}).catch(() => {});
      });
    });
  }
  const fieldSelect = $('#arenaFieldSelect');
  if (fieldSelect) fieldSelect.addEventListener('change', () => { currentField = fieldSelect.value; fieldSelectionReady=true; renderAds(); });
  document.addEventListener('fieldzero:fields-ready', event => {
    currentField = event.detail?.selectedFieldId || event.detail?.mainFieldId || '';
    fieldSelectionReady = true;
    renderAds();
  });
  loadAds();

  // Field partner form: Auth account creation is separate from the application record.
  const form = $('#fieldPartnerForm');
  if (form) form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#fieldPartnerSubmit');
    const status = $('#fieldPartnerStatus');
    if (!db) { setStatus(status, 'The application service is not configured yet. Please contact FIELDZERO.', 'error'); return; }
    const fd = new FormData(form);
    const email = String(fd.get('owner_email') || '').trim().toLowerCase();
    const password = String(fd.get('password') || '');
    const confirmPassword = String(fd.get('confirm_password') || '');
    const mapUrl = String(fd.get('google_maps_url') || '').trim();
    if (password.length < 8) { setStatus(status, 'Use a password with at least 8 characters.', 'error'); return; }
    if (password !== confirmPassword) { setStatus(status, 'The two passwords do not match.', 'error'); return; }
    if (mapUrl && !/^https:\/\//i.test(mapUrl)) { setStatus(status, 'The Google Maps link must begin with https://.', 'error'); return; }
    if (fd.get('consent') !== 'on') { setStatus(status, 'Please confirm the application consent.', 'error'); return; }
    button.disabled = true; button.textContent = 'CREATING SECURE ACCOUNT…';
    const redirect = new URL('field-admin.html', window.location.href).href;
    const { data: authData, error: authError } = await db.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirect, data: { fieldzero_role: 'field_applicant' } }
    });
    if (authError) {
      button.disabled = false; button.textContent = 'CREATE ACCOUNT & SUBMIT APPLICATION ↗';
      const known = /already|registered|exists/i.test(authError.message || '');
      setStatus(status, known
        ? 'An account may already exist for this email. Sign in at the Field Admin Portal with that email, then contact the central team to link your application.'
        : `Secure account could not be created: ${authError.message}`, 'error');
      return;
    }
    const request = {
      field_name: String(fd.get('field_name') || '').trim(),
      owner_name: String(fd.get('owner_name') || '').trim(),
      owner_email: email,
      owner_mobile: String(fd.get('owner_mobile') || '').trim(),
      address: String(fd.get('address') || '').trim(),
      google_maps_url: mapUrl,
      latitude: String(fd.get('latitude') || '').trim(),
      longitude: String(fd.get('longitude') || '').trim(),
      proposal: String(fd.get('proposal') || '').trim()
    };
    const { data: requestId, error: requestError } = await db.rpc('fz_submit_field_request', { p_request: request });
    button.disabled = false; button.textContent = 'CREATE ACCOUNT & SUBMIT APPLICATION ↗';
    if (requestError) {
      setStatus(status, `Your secure account step completed, but the application was not saved: ${requestError.message}. Do not create a second account. Contact FIELDZERO with ${email}.`, 'error');
      return;
    }
    form.reset();
    const awaiting = !authData?.session;
    setStatus(status, `Application ${String(requestId).slice(0, 8).toUpperCase()} received. ${awaiting ? 'Check your email and verify the owner account before central approval.' : 'Your owner account has been created.'} The Imbulgoda central team will review your proposed field. A field is not live until approved.`, 'success');
  });
})();
