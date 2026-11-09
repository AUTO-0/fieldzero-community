/* FIELDZERO V15 - tidy admin workspace navigation.
   Moves the existing V2-V14 controls into clear workspace views without
   changing their IDs or data handlers. */
(() => {
  const dashboard = document.getElementById('dashboard');
  if (!dashboard || dashboard.dataset.workspaceReady === '1') return;
  dashboard.dataset.workspaceReady = '1';

  const topBar = dashboard.querySelector(':scope > .admin-bar');
  const status = dashboard.querySelector(':scope > #adminStatus');
  const ops = dashboard.querySelector(':scope > .ops-console');
  const foot = dashboard.querySelector(':scope > .admin-foot');

  const definitions = [
    ['overview','Overview','activity'],
    ['bookings','Bookings','calendar-check'],
    ['network','Field network','map-pin'],
    ['finance','Finance','wallet'],
    ['operations','Operations','clipboard-check'],
    ['community','Community','users'],
    ['website','Website & ads','monitor']
  ];
  const panels = new Map();
  definitions.forEach(([key,label]) => {
    const panel = document.createElement('section');
    panel.className = 'admin-workspace-panel';
    panel.dataset.workspacePanel = key;
    panel.hidden = key !== 'overview';
    panels.set(key,panel);
  });

  const shell = document.createElement('div');
  shell.className = 'admin-workspace-shell';
  const nav = document.createElement('nav');
  nav.className = 'admin-workspace-nav';
  nav.setAttribute('aria-label','Admin workspace');
  const main = document.createElement('div');
  main.className = 'admin-workspace-main';
  definitions.forEach(([key,label,icon]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-workspace-tab' + (key === 'overview' ? ' active' : '');
    button.dataset.workspaceTab = key;
    button.innerHTML = `<span class="admin-tab-mark">${({activity:'◫','calendar-check':'▦','map-pin':'⌖',wallet:'＄','clipboard-check':'☷',users:'◎',monitor:'▣'})[icon]}</span><span>${label}</span>`;
    button.addEventListener('click',() => selectPanel(key));
    nav.append(button);
  });
  definitions.forEach(([key]) => main.append(panels.get(key)));
  shell.append(nav,main);

  function selectPanel(key) {
    panels.forEach((panel,name) => { panel.hidden = name !== key; });
    nav.querySelectorAll('[data-workspace-tab]').forEach(button => {
      const active = button.dataset.workspaceTab === key;
      button.classList.toggle('active',active);
      button.setAttribute('aria-current',active ? 'page' : 'false');
    });
    const openDetails = panels.get(key)?.querySelector('details.admin-simple-module, details.ops-module');
    if (openDetails) openDetails.open = true;
  }

  if (topBar) {
    topBar.classList.add('admin-workspace-topbar');
    panels.get('overview').append(topBar);
  }
  if (status) panels.get('overview').append(status);
  // Owner's main field and public game-mode settings belong on the landing dashboard,
  // not inside the legacy Community accordion (which is hidden on first login).
  const mainFieldControl=dashboard.querySelector(':scope > #fzMainFieldControl');
  const gameModes=dashboard.querySelector(':scope > #fzGameModeManager');
  if(mainFieldControl) panels.get('overview').append(mainFieldControl);
  if(gameModes) panels.get('overview').append(gameModes);
  dashboard.insertBefore(shell,foot || null);

  // The existing operations console has a useful KPI header and independent modules.
  if (ops) {
    const heading = ops.querySelector('.ops-console-heading');
    const kpis = ops.querySelector('#opsKpiGrid');
    const opsStatus = ops.querySelector('#opsConsoleStatus');
    [heading,kpis,opsStatus].filter(Boolean).forEach(node => panels.get('overview').append(node));
    const modules = [...ops.querySelectorAll(':scope > details.ops-module')];
    modules.forEach(details => {
      const t = (details.querySelector('summary')?.textContent || '').toLowerCase();
      const key = t.includes('booking') ? 'bookings'
        : t.includes('finance') || t.includes('cashbook') ? 'finance'
        : t.includes('spotlight') || t.includes('social media') ? 'website'
        : 'operations';
      details.open = false;
      panels.get(key).append(details);
    });
    ops.remove();
  }

  // Group the older admin forms by their existing section headings.
  let currentKey = 'community';
  let currentBlock = null;
  const remaining = [...dashboard.children].filter(node => node !== shell && node !== foot && node !== topBar && node !== status);
  function categoryForHeading(text) {
    const h = text.toLowerCase();
    if (h.includes('field') || h.includes('location')) return 'network';
    if (h.includes('finance') || h.includes('invoice') || h.includes('cashbook') || h.includes('package price')) return 'finance';
    if (h.includes('booking') || h.includes('event') || h.includes('match result')) return 'bookings';
    if (h.includes('website') || h.includes('social media') || h.includes('seasonal') || h.includes('launch mode') || h.includes('gallery')) return 'website';
    return 'community';
  }
  remaining.forEach(node => {
    if (node.classList?.contains('admin-foot')) return;
    if (node.classList?.contains('franchise-network-panel')) {
      panels.get('network').append(node);
      currentBlock = null;
      return;
    }
    if (node.classList?.contains('ads-management-panel')) {
      panels.get('website').append(node);
      currentBlock = null;
      return;
    }
    if (node.classList?.contains('admin-bar')) {
      const heading = node.querySelector('h2')?.textContent || '';
      currentKey = categoryForHeading(heading);
      currentBlock = document.createElement('div');
      currentBlock.className = 'admin-content-block';
      currentBlock.append(node);
      panels.get(currentKey).append(currentBlock);
    } else {
      if (!currentBlock) {
        currentBlock = document.createElement('div');
        currentBlock.className = 'admin-content-block';
        panels.get(currentKey).append(currentBlock);
      }
      currentBlock.append(node);
    }
  });
  // Convert long legacy admin blocks into compact accordions, keeping every control and ID intact.
  document.querySelectorAll('.admin-content-block').forEach(block => {
    const heading = block.querySelector(':scope > .admin-bar');
    if (!heading) return;
    const h = heading.querySelector('h2,h3');
    const title = (h?.textContent || 'Management tools').trim();
    const desc = heading.querySelector('p')?.textContent || '';
    const details = document.createElement('details');
    details.className = 'admin-simple-module';
    const summary = document.createElement('summary');
    summary.innerHTML = `<span>${title}</span><small>${desc}</small>`;
    const content = document.createElement('div'); content.className = 'admin-simple-module-content';
    [...block.children].forEach(node => { if (node !== heading) content.append(node); });
    details.append(summary,content);
    block.replaceWith(details);
  });

  if (foot) dashboard.append(foot);

  // Make long operational controls opt-in while preserving every feature.
  document.querySelectorAll('#dashboard details.ops-module').forEach(d => { d.open = false; });
})();
