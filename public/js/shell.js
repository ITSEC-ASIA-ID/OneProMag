import { openAccountMenu, renderAuth } from './auth.js';
import { loadDevices } from './devices.js';
import { loadDirectory } from './directory.js';
import { loadInfoPage } from './info.js';
import { loadProjects, mountContent, openProjectForm } from './projects.js';
import { openPerson } from './shared.js';
import { ADMIN_NAV, NAV, canManageCatalog, navAllowed, root, state } from './state.js';
import { loadBoard } from './team.js';
import { refreshUsers } from './users.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { propKeys, setProperties } from './props.js';
import { applyTheme, avatar, currentTheme, escapeHtml as h, toast, toggleTheme } from './ui.js';


/* ============================================================
   app shell
   ============================================================ */
export function sidebarHTML() {
  const s = state.stats || { total: 0, active: 0, queue: 0, clients: 0 };
  // The Users badge counts the rows the page actually lists: the tree (which holds
  // admins too, because an admin can carry a pentest level) plus the project
  // supervisors. `stats.pentesters` counts only `role = 'Pentester'`, so using it here
  // made the badge disagree with the page it opens by exactly the admins.
  const userCount = new Set(
    [...(state.pentesters || []), ...(state.supervisors || [])].map((u) => Number(u.id))
  ).size;
  const navBtn = (nav, glyph, label, count, cls = '') =>
    `<button class="nav-item ${cls}" data-nav="${nav}">
       ${glyph}<span>${label}</span>${count !== undefined ? `<span class="count">${count}</span>` : ''}
     </button>`;

  return `
    <aside class="sidebar" id="sidebar">
      <div class="brand">
        <div class="brand-mark">${icon.shield(20)}</div>
        <div>
          <div class="brand-name">OneProMag</div>
          <div class="brand-sub">Pentest PM</div>
        </div>
      </div>

      <div class="nav-label">Workspace</div>
      ${navBtn('team', icon.users(), 'Team status')}
      ${navBtn('directory', icon.contact(16), 'Users')}
      ${navBtn('info', icon.book(16), 'Information center')}
      ${navBtn('devices', icon.phone(), 'Devices', s.devices ?? 0)}
      <div class="nav-divider"></div>
      ${navBtn('active', icon.play(), 'Active projects', s.active ?? 0)}
      ${navBtn('all', icon.grid(), 'All projects')}
      ${navBtn('mineActive', icon.user(), 'My active projects', s.mineActive ?? 0)}
      ${navBtn('mineAll', icon.layers(16), 'My all projects')}

      ${
        canManageCatalog()
          ? `<div class="nav-label">Admin panel</div>
             ${navBtn('clients', icon.building(16), 'Clients & apps', s.clients ?? 0, 'admin')}
             ${navBtn('users', icon.userCheck(16), 'Manage users', userCount, 'admin')}
             ${navBtn('properties', icon.tag(), 'Properties', propKeys('category').length + propKeys('status').length, 'admin')}`
          : ''
      }

      <div class="sidebar-foot">
        <button class="user-chip" id="user-chip">
          ${avatar(state.user.name)}
          <div class="meta">
            <strong>${h(state.user.name)}</strong>
            <span>${h(state.user.subrole || 'Member')} · ${h(state.user.role)}</span>
          </div>
          ${icon.chevronRight()}
        </button>
      </div>
    </aside>`;
}


export function shellHTML() {
  return `
    <div class="app" id="app">
      <div class="scrim" id="scrim"></div>
      ${sidebarHTML()}
      <div class="main">
        <header class="topbar">
          <button class="btn btn-icon hamburger" id="hamburger" aria-label="Open menu">${icon.menu()}</button>
          <div class="topbar-title">
            <h1 id="page-title">${h(NAV[state.nav]?.title || 'All projects')}</h1>
            <p id="page-sub">Loading…</p>
          </div>
          <div class="topbar-actions">
            <div class="presence" id="presence">
              <button class="presence-btn" id="presence-btn" aria-haspopup="true" aria-expanded="false"
                      aria-controls="presence-pop" title="Who is online">
                <span class="presence-stack" id="presence-stack"></span>
                <span class="presence-n" id="presence-n">–</span>
              </button>
              <div class="presence-pop" id="presence-pop" hidden></div>
            </div>
            <button class="btn btn-icon" id="theme-btn" aria-label="Toggle theme">
              ${currentTheme() === 'dark' ? icon.sun() : icon.moon()}
            </button>
            <button class="btn btn-primary" id="new-project" aria-label="New project">${icon.plus()}<span class="hide-sm">New project</span><span class="show-sm">New</span></button>
          </div>
        </header>
        <div class="content" id="content"></div>
      </div>
    </div>`;
}


export function bindShell() {
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('app').classList.add('nav-open');
  });
  document.getElementById('scrim').addEventListener('click', () => {
    document.getElementById('app').classList.remove('nav-open');
  });

  document.getElementById('theme-btn').addEventListener('click', (e) => {
    const t = toggleTheme();
    e.currentTarget.innerHTML = t === 'dark' ? icon.sun() : icon.moon();
  });

  document.getElementById('new-project').addEventListener('click', () => openProjectForm());
  bindPresence();

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => handleNav(btn.dataset.nav));
  });
  document.getElementById('user-chip').addEventListener('click', openAccountMenu);
}


export function bindSidebar() {
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => handleNav(btn.dataset.nav));
  });
  document.getElementById('user-chip')?.addEventListener('click', openAccountMenu);
}


export function handleNav(nav) {
  document.getElementById('app').classList.remove('nav-open');

  if (nav === 'team' && state.nav !== 'team') state.boardLoaded = false;

  if (ADMIN_NAV.has(nav)) {
    if (!navAllowed(nav)) {
      toast('Only admin, lead or sub lead can open the admin panel', 'err');
      return;
    }
    state.nav = nav;
    finishNav();
    return;
  }

  // reset scope, then apply the selected one
  state.nav = nav;
  finishNav();
}


export function finishNav() {
  localStorage.setItem('opm-nav', state.nav);
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.nav));

  const onBoard = state.nav === 'team';

  mountContent();
  // Admin pages render their own content; there is no project list to load.
  if (
    state.nav === 'clients' ||
    state.nav === 'users' ||
    state.nav === 'properties' ||
    state.nav === 'info' ||
    state.nav === 'devices' ||
    state.nav === 'directory'
  ) {
    if (state.nav === 'info') loadInfoPage();
    if (state.nav === 'devices') loadDevices();
    // The Users page renders from state that the project list fills in.
    if (state.nav === 'users') refreshUsers();
    if (state.nav === 'directory') loadDirectory();
    return;
  }
  if (onBoard) {
    // Skeleton first, data second: a cold board otherwise flashes an empty page.
    loadBoard().then(() => {
      if (state.nav === 'team') mountContent();
    });
    return;
  }
  loadProjects();
}


export function setTitle(title, sub) {
  const t = document.getElementById('page-title');
  const s = document.getElementById('page-sub');
  if (t) t.textContent = title;
  if (s) s.textContent = sub;
}


/* ============================================================
   Who is online
   ------------------------------------------------------------
   A badge, not a feature: who else is around right now, so a
   question goes to somebody who is at their desk instead of an
   inbox. One poll every 45 seconds — and that poll IS the
   "I am here" ping, so there is no second heartbeat to keep alive.
   ============================================================ */
export const PRESENCE_POLL_MS = 45_000;

export let presenceTimer = null;


export async function loadPresence() {
  let data;
  try {
    data = await api.presence();
  } catch {
    // A courtesy badge is never worth interrupting the page for. Keep the last
    // answer and let the next poll correct it.
    return;
  }
  state.online = Array.isArray(data.online) ? data.online : [];
  paintPresence();
}


/**
 * Up to three faces, then the plain number. The faces answer "is anyone there",
 * which the number alone cannot — the same reason a project row shows avatars
 * instead of "+3".
 */
export function presenceStackHTML(people) {
  const others = people.filter((p) => !p.self);
  // Alone, "1" on its own reads like a notification: the glyph says who the
  // number is counting.
  if (!others.length) return `<span class="presence-solo">${icon.user()}</span>`;
  return others
    .slice(0, 3)
    .map((p) => avatar(p.name, 'sm'))
    .join('');
}


export function presencePopHTML() {
  const people = state.online || [];
  const head = `<div class="pp-head">Online now · ${people.length}</div>`;
  if (!people.length) {
    return `${head}<div class="pp-empty">Nobody has been active in the last couple of minutes.</div>`;
  }
  return (
    head +
    people
      .map(
        (p) => `<button class="pp-row" data-presence-person="${p.id}">
          ${avatar(p.name, 'sm')}
          <span class="pp-meta">
            <strong>${h(p.name)}${p.self ? ' <span class="pp-you">you</span>' : ''}</strong>
            <span>${h(p.subrole || 'Member')} · ${h(p.role)}</span>
          </span>
        </button>`
      )
      .join('')
  );
}


export function paintPresence() {
  const btn = document.getElementById('presence-btn');
  if (!btn) return;
  const people = state.online || [];
  const others = people.filter((p) => !p.self);
  const stack = document.getElementById('presence-stack');
  const count = document.getElementById('presence-n');
  if (stack) stack.innerHTML = presenceStackHTML(people);
  if (count) count.textContent = String(people.length);
  btn.classList.toggle('is-alone', others.length === 0);
  btn.title = people.length
    ? others.length
      ? `${people.length} online now`
      : 'Just you online right now'
    : 'Nobody online right now';
  const pop = document.getElementById('presence-pop');
  if (pop && !pop.hidden) pop.innerHTML = presencePopHTML();
}


export function bindPresence() {
  const btn = document.getElementById('presence-btn');
  const pop = document.getElementById('presence-pop');
  if (!btn || !pop) return;

  const close = () => {
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    pop.innerHTML = presencePopHTML();
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop.hidden) open();
    else close();
  });
  pop.addEventListener('click', (e) => {
    const row = e.target.closest('[data-presence-person]');
    if (!row) return;
    close();
    openPerson(Number(row.dataset.presencePerson));
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !e.target.closest('#presence')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) close();
  });

  loadPresence();
  clearInterval(presenceTimer);
  presenceTimer = setInterval(loadPresence, PRESENCE_POLL_MS);
  // A tab that was in the background for an hour is stale the moment it comes
  // back, and the person looking at it is the one who wants to know who is on.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadPresence();
  });
}


export async function loadStats() {
  state.stats = await api.stats();
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.outerHTML = sidebarHTML();
  bindSidebar();
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.nav));
  const statsHost = document.getElementById('stats');
  if (statsHost) statsHost.innerHTML = statsHTML();
}


/* ============================================================
   content: stats + filters + list
   ============================================================ */
export function statsHTML() {
  const s = state.stats;
  if (!s) return '';

  // On a "My ..." scope the four cards describe YOUR engagements, not the
  // company's. Showing 7 total projects above a list of your 4 forced the user
  // to reconcile two numbers that were never about the same thing.
  const personal = state.nav === 'mineActive' || state.nav === 'mineAll';
  const sc = (personal ? s.scopes?.mine : s.scopes?.all) || {
    total: s.total,
    ready: s.byStatus?.Ready ?? 0,
    active: s.active,
    queue: s.queue,
    ongoing: s.byStatus?.Ongoing ?? 0,
  };
  // Total open REQUESTS in this scope, straight from the server. Deriving it
  // from the visible page of projects would undercount as soon as the list is
  // filtered or paginated.
  const openRetests = sc.openRetests ?? s.openRetests;

  const cards = [
    { label: 'Total projects', value: sc.total, sub: `${sc.ongoing ?? 0} ongoing`, accent: 'var(--primary)', icon: 'layers' },
    { label: 'Ready', value: sc.ready, sub: 'report in progress', accent: 'var(--violet)', icon: 'flag' },
    { label: 'Active', value: sc.active, sub: 'not finished yet', accent: 'var(--amber)', icon: 'play' },
    { label: 'Retest queue', value: sc.queue, sub: `${openRetests} open request${openRetests === 1 ? '' : 's'}`, accent: 'var(--cyan)', icon: 'queue' },
  ];
  // A quiet scope marker on the card strip. Without it the same four cards
  // silently report different numbers when you move between scopes, and the
  // user has no way to tell "these went down" from "these are no longer mine".
  const scopeCue = personal
    ? `<div class="stat-scope" data-scope="mine">${icon.user(13)}Only your projects</div>`
    : `<div class="stat-scope" data-scope="all">${icon.users(13)}Everyone's projects</div>`;

  return `<div class="stat-head">${scopeCue}</div>
  <div class="stat-grid">${cards
    .map(
      (c) => `<div class="stat" style="--accent:${c.accent}">
        <div class="lbl">${icon[c.icon]()}${h(c.label)}</div>
        <div class="val">${c.value}</div>
        <div class="sub">${h(c.sub)}</div>
      </div>`
    )
    .join('')}</div>`;
}

export async function boot() {
  applyTheme(currentTheme());
  try {
    const me = await api.me();
    // Recorded before anything renders: the login screen is the first thing an
    // unauthenticated visitor sees, and it needs to know what to offer.
    state.demo = me.demo === true;
    state.allowRegister = me.allowRegister === true;
    if (!me.user) {
      renderAuth('login');
      return;
    }
    state.user = me.user;
    // Properties first among equals: every badge, picker and filter below is built
    // from this list, so it has to be in the registry before anything renders.
    const [usersRes, stats, clientsRes, appsRes, supervisorsRes, propsRes] = await Promise.all([
      api.users(),
      api.stats(),
      api.clients(),
      api.applications(),
      api.supervisors(),
      api.properties(),
    ]);
    setProperties(propsRes);
    state.users = usersRes.users;
    state.stats = stats;
    state.clients = clientsRes.clients;
    state.applications = appsRes.applications;
    state.supervisors = supervisorsRes.supervisors;

    if (canManageCatalog()) {
      const treeRes = await api.pentesters();
      state.pentesters = treeRes.pentesters;
      state.pentesterTree = treeRes.tree;
    }

    // A remembered admin page must not survive a switch to an unprivileged
    // account, or the shell would render a page whose nav row is not even shown.
    if (!navAllowed(state.nav)) state.nav = 'active';
    if (!NAV[state.nav]) state.nav = 'active';

    root.innerHTML = shellHTML();
    bindShell();
    mountContent();
    document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.nav));

    if (state.nav === 'clients' || state.nav === 'properties') return;
    if (state.nav === 'directory') return void loadDirectory();
    // The Users page counts each person's projects and each supervisor's owned
    // engagements, so opening it cold (a reload straight onto it) must fetch the
    // project list as well — otherwise every card reads "0 projects".
    if (state.nav === 'users') return void refreshUsers();
    // The information center restores the last-selected client/application, so
    // it needs its own load rather than the project list.
    if (state.nav === 'info') return void loadInfoPage();
    // Devices restores its last-viewed type tab, so it loads itself rather than
    // the project list.
    if (state.nav === 'devices') return void loadDevices();
    await loadProjects();
  } catch (err) {
    console.error('[boot] failed:', err);
    renderAuth('login');
  }
}
