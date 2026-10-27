import { api, onUnauthorized } from './api.js';
import {
  escapeHtml as h,
  initials,
  avatar,
  avatarStack,
  statusBadge,
  quickStatus,
  envBadge,
  catBadge,
  catIcon,
  methodBadge,
  subroleBadge,
  sortPentesters,
  teamCell,
  supervisorCell,
  contactLine,
  availabilityBadge,
  personCardHTML,
  daysSince,
  renderMarkdown,
  fmtDate,
  fmtRelative,
  todayISO,
  toast,
  openModal,
  confirmDialog,
  segmented,
  bindSegmented,
  segmentedValue,
  applyTheme,
  currentTheme,
  toggleTheme,
  combobox,
  setComboboxItems,
  setComboboxValue,
  bindCombobox,
} from './ui.js';
import { icon, CATEGORY, STATUS, ENV, DEVICE_KIND, AVAILABILITY } from './icons.js';
import { setProperties, propKeys, propList, propOptions, propLabel, propTone } from './props.js';

const root = document.getElementById('root');

const ENUMS = {
  category: ['Web', 'Mobile', 'API', 'EDC'],
  platform: ['Android', 'iOS', 'API'],
  env: ['Dev', 'Prod'],
  method: ['Black Box', 'Grey Box', 'White Box'],
  // Working statuses first, then the two terminal outcomes, then Hold.
  status: ['Incoming', 'Ready', 'Ongoing', 'Done', 'Hold'],
  // Lead > Sub Lead > Member > Intern. An intern is the trainee level: they test
  // alongside whoever supervises them and get their own table on the board.
  subrole: ['Lead', 'Sub Lead', 'Member', 'Intern'],
  // Project Manager is its own role. PMs own engagements; they are not
  // pentesters and never appear in the "who pentest" picker. (Supervisor is the
  // name of the project FIELD, which accepts a PM or a pentester.)
  role: ['Pentester', 'Project Manager', 'Admin'],
};

/** Badge tones for the status segmented control, straight from the live list. */
const statusTones = () => Object.fromEntries(propList('status').map((p) => [p.key, p.tone]));
const METHOD_TONE = { 'Black Box': 'rose', 'Grey Box': 'amber', 'White Box': 'green' };

/**
 * A nav id remembered by an older build may name a page this build no longer has:
 * Pentesters and project managers were merged into one Users page. Without this the
 * shell would boot on an id with no NAV entry and fall back to Active projects.
 */
function normalizeNav(id) {
  return id === 'pentesters' || id === 'supervisors' ? 'users' : id;
}

/**
 * The pages only an admin, lead or sub lead may open.
 *
 * One list, because three places need to agree and they did not: `handleNav`
 * guarded three ids while `boot()`'s downgrade listed two, so a user whose
 * remembered nav was `properties` and who had since been demoted to Member booted
 * straight into the Properties admin page — a page whose sidebar row is not even
 * rendered for them.
 */
const ADMIN_NAV = new Set(['clients', 'users', 'properties']);

function navAllowed(id) {
  return !ADMIN_NAV.has(id) || canManageCatalog();
}

/**
 * Workspace navigation. `prod` is intentionally gone; `active` is the
 * "everything except Done" view, `queue` is the client-retest queue.
 */
const NAV = {
  all: { title: 'All projects', sub: 'Every pentest engagement in the workspace' },
  active: { title: 'Active projects', sub: 'Everything still in flight, including retests' },
  mineActive: { title: 'My active projects', sub: 'Your engagements that are still in flight' },
  mineAll: { title: 'My all projects', sub: 'Every engagement you are assigned to, finished or not' },
  team: { title: 'Team status', sub: 'Who is on a project, who is idle, and for how long' },
  clients: { title: 'Clients', sub: 'Clients and their applications' },
  info: { title: 'Information center', sub: 'Free-form notes for each client and application' },
  devices: { title: 'Devices', sub: 'The phones, terminals and kit the team tests with' },
  // Pentesters and project managers are one page: same `users` table, same create
  // path, same question ("who works here?"). Two pages made adding someone start
  // with a guess about which one they belonged on.
  // Two pages answer "who works here": this one is the read-only directory anyone can
  // open, and `accounts` manages them. Same table, different job, different name.
  directory: {
    title: 'Users',
    sub: 'Everyone on the team, with the role and contact details to reach them',
  },
  accounts: {
    title: 'Manage users',
    sub: 'Accounts, roles and the pentest reporting tree',
  },
  properties: {
    title: 'Properties',
    sub: 'The categories and statuses a project can carry',
  },
};

const state = {
  user: null,
  // Both come from /api/auth/me; false until the server says otherwise.
  demo: false,
  allowRegister: false,
  info: [],
  infoQuery: '',
  infoResults: [],
  // The fixed text+table document for the selected target. Undefined until
  // loaded, so the pane can show a skeleton instead of an empty editor.
  doc: undefined,
  infoSearching: false,
  infoCounts: {},
  // Per-client open/closed choice for the target tree; absent means "decide from
  // the current selection". Kept in memory only — this is a view preference.
  infoOpen: {},
  // Which environment sheet an application shows. Dev is the default on purpose:
  // production testing is the exception, and opening on Prod would be a foot-gun.
  infoEnv: {}, 
  infoTarget: localStorage.getItem('opm-info-target') || '',
  // Devices
  devices: [],
  deviceFields: {},
  deviceLabels: {},
  deviceKinds: ['Android', 'iOS', 'EDC', 'Misc'],
  deviceCounts: {},
  deviceColumns: {},
  // The active kind tab. Remembered so a reload does not bounce back to Android.
  deviceKind: localStorage.getItem('opm-device-kind') || 'Android',
  deviceQuery: '',
  devicesLoading: false,
  // Team board: the card you clicked and the text in its search box. View state,
  // not data — it survives a repaint but is deliberately not remembered between
  // sessions, because a board that opens pre-filtered hides a whole status.
  boardFilter: '',
  boardQuery: '',
  // Rows-per-page for the wide EDC sheet; 0 means "show everything".
  deviceLimit: 50,
  // Paging for the four project lists. 50 is the default; the choice is
  // remembered per browser because a team that wants 100 should not say so daily.
  pageSize: Number(localStorage.getItem('opm-page-size') || 50) || 50,
  page: 1,
  // Signature of the query the current page belongs to: any change to the scope,
  // the filters or the search resets to page 1, while a status change or a save
  // (same query, new data) keeps you where you were.
  pageSig: null,
  // Bulk grid edit: null when viewing. Otherwise
  //   { ids: [deviceId], draft: { [deviceId]: { [colKey]: string } } }
  // The draft is seeded from the rows on screen and only written on Save, so an
  // abandoned edit cannot half-apply across twenty rows.
  deviceEdit: null,
  users: [],
  supervisors: [],
  // The staff directory (read-only): every account, alphabetical.
  directory: [],
  dirQuery: '',
  // Which half of the Users page is on screen: 'all' | 'pentesters' | 'supervisors'.
  usersTab: 'all',
  stats: null,
  projects: [],
  clients: [],
  applications: [],
  pentesters: [],
  pentesterTree: [],
  board: [],
  boardTotals: null,
  loading: true,
  view: localStorage.getItem('opm-view') || 'grid',
  // The workspace opens on Active projects the first time, then remembers where
  // you were — reloading on the Information center used to dump you back on the
  // project list, losing the client you were reading. A remembered admin page from
  // an older build is translated: Pentesters and project managers are one page now.
  nav: normalizeNav(localStorage.getItem('opm-nav') || 'active'),
  // `status` is part of the filter bar; env/method selects were removed, but the
  // API still accepts them, so the keys stay in the payload shape.
  filters: { q: '', status: '', category: '', env: '', method: '', clientId: '', applicationId: '' },
  filtersOpen: false,
  drawerProjectId: null,
  drawerTab: 'overview',
  drawer: null,
};

/** Client-side mirror of canManageCatalog() in server/db.js. */
function canManageCatalog() {
  const u = state.user;
  if (!u) return false;
  return u.role === 'Admin' || u.subrole === 'Lead' || u.subrole === 'Sub Lead';
}

/* ============================================================
   login view
   ============================================================ */
function renderAuth(mode = 'login') {
  // The server decides both of these (see /api/auth/me): a production install seeds
  // no demo accounts and closes registration, and the screen it shows must not
  // advertise either. Unknown means no — offering a form that answers 403 is worse
  // than not offering it.
  const canRegister = state.allowRegister === true;
  const showDemo = state.demo === true;
  const isRegister = mode === 'register' && canRegister;
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="brand">
          <div class="brand-mark">${icon.shield(20)}</div>
          <div>
            <div class="brand-name">OneProMag</div>
            <div class="brand-sub">Pentest PM</div>
          </div>
        </div>

        <div class="auth-head">
          <h1>${isRegister ? 'Create your account' : 'Welcome back'}</h1>
          <p>${isRegister ? 'Join the pentest workspace.' : 'Sign in to manage your pentest projects.'}</p>
        </div>

        <form class="auth-form" id="auth-form" autocomplete="on">
          ${
            isRegister
              ? `<div class="field">
                   <label for="name">Full name</label>
                   <input class="input" id="name" name="name" placeholder="e.g. Rafi Pratama" required />
                 </div>`
              : ''
          }
          <div class="field">
            <label for="username">${isRegister ? 'Username' : 'Username or email'}</label>
            <input class="input" id="username" name="username"
                   placeholder="${isRegister ? 'your.username' : 'your.username or you@company.com'}"
                   autocomplete="${isRegister ? 'username' : 'username email'}"
                   autocapitalize="none" spellcheck="false" required />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <div class="pw-wrap">
              <input class="input" id="password" name="password" type="password" placeholder="Your password"
                     autocomplete="${isRegister ? 'new-password' : 'current-password'}" required />
              <button class="pw-toggle" type="button" data-pw-toggle aria-label="Show password">${icon.eye()}</button>
            </div>
          </div>
          <div class="auth-error" id="auth-error">${icon.alert()}<span></span></div>
          <button class="btn btn-primary" type="submit" id="auth-submit" style="height:42px;margin-top:2px">
            ${isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        ${
          canRegister
            ? `<div class="auth-alt">
                 <span>${isRegister ? 'Already have an account?' : 'Need an account?'}</span>
                 <button class="link-btn" id="switch-mode">${isRegister ? 'Sign in' : 'Register'}</button>
               </div>`
            : `<div class="auth-alt auth-alt-note">
                 <span>Accounts are created by an administrator — ask your team lead.</span>
               </div>`
        }

        ${
          isRegister || !showDemo
            ? ''
            : `<div class="demo-box">
                 <p>Demo accounts</p>
                 <div class="demo-row">
                   <span><code>admin</code> / <code>admin123</code> <em>Admin · Lead</em></span>
                   <button class="btn btn-sm" data-fill="admin">Use</button>
                 </div>
                 <div class="demo-row">
                   <span><code>rafi</code> / <code>pentester123</code> <em>Lead</em></span>
                   <button class="btn btn-sm" data-fill="rafi">Use</button>
                 </div>
                 <div class="demo-row">
                   <span><code>dewi</code> / <code>pentester123</code> <em>Sub Lead</em></span>
                   <button class="btn btn-sm" data-fill="dewi">Use</button>
                 </div>
                 <div class="demo-row">
                   <span><code>bagas</code> / <code>pentester123</code> <em>Member</em></span>
                   <button class="btn btn-sm" data-fill="bagas">Use</button>
                 </div>
               </div>`
        }
      </div>
    </div>`;

  const form = document.getElementById('auth-form');
  const errBox = document.getElementById('auth-error');
  const submit = document.getElementById('auth-submit');

  document.getElementById('switch-mode')?.addEventListener('click', () => {
    if (!canRegister) return;
    renderAuth(isRegister ? 'login' : 'register');
  });

  const pw = document.getElementById('password');
  const toggle = form.querySelector('[data-pw-toggle]');
  toggle.addEventListener('click', () => {
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    toggle.innerHTML = show ? icon.eyeOff() : icon.eye();
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  document.querySelectorAll('[data-fill]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('username').value = btn.dataset.fill;
      pw.value = btn.dataset.fill === 'admin' ? 'admin123' : 'pentester123';
      errBox.classList.remove('show');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.remove('show');
    submit.disabled = true;
    submit.textContent = isRegister ? 'Creating…' : 'Signing in…';
    try {
      if (isRegister) {
        const name = document.getElementById('name').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = pw.value;
        // Level is deliberately not self-assigned: the server forces new
        // self-registered accounts to Member, and only an admin can promote.
        const res = await api.register({ name, username, password });
        state.user = res.user;
      } else {
        const res = await api.login(document.getElementById('username').value.trim(), pw.value);
        state.user = res.user;
      }
      await boot();
    } catch (err) {
      errBox.querySelector('span').textContent = err.message;
      errBox.classList.add('show');
      submit.disabled = false;
      submit.textContent = isRegister ? 'Create account' : 'Sign in';
    }
  });
}

/* ============================================================
   app shell
   ============================================================ */
function sidebarHTML() {
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

function shellHTML() {
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
            <div class="search">
              ${icon.search()}
              <input class="input" id="search-input" placeholder="Search projects…" autocomplete="off" />
              <kbd>⌘K</kbd>
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

function bindShell() {
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

  const search = document.getElementById('search-input');
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.filters.q = search.value.trim();
      const filterQ = document.getElementById('filter-q');
      if (filterQ && filterQ.value !== state.filters.q) filterQ.value = state.filters.q;
      if (['clients', 'users', 'directory', 'info', 'devices'].includes(state.nav)) return;
      loadProjects();
    }, 160);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      search.focus();
      search.select();
    }
  });

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => handleNav(btn.dataset.nav));
  });
  document.getElementById('user-chip').addEventListener('click', openAccountMenu);
}

function handleNav(nav) {
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

function finishNav() {
  localStorage.setItem('opm-nav', state.nav);
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.nav));

  // The team board is not a project list: hide the project-only chrome.
  const onBoard = state.nav === 'team';
  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.classList.toggle('board-mode', onBoard);
  const search = document.getElementById('search-input');
  if (search) search.disabled = onBoard;

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

function setTitle(title, sub) {
  const t = document.getElementById('page-title');
  const s = document.getElementById('page-sub');
  if (t) t.textContent = title;
  if (s) s.textContent = sub;
}

function openAccountMenu() {
  openModal({
    title: state.user.name,
    subtitle: `@${state.user.username}`,
    body: `
      <div class="role-line">
        ${subroleBadge(state.user.subrole || 'Member')}
        <span class="badge badge-outline">${h(state.user.role)}</span>
      </div>
      <div class="hierarchy">
        <div class="hier-row ${state.user.subrole === 'Lead' ? 'on' : ''}"><span class="hier-dot"></span><strong>Lead</strong><span>Owns the engagement, approves scope</span></div>
        <div class="hier-row ${state.user.subrole === 'Sub Lead' ? 'on' : ''}"><span class="hier-dot"></span><strong>Sub Lead</strong><span>Runs the day-to-day testing</span></div>
        <div class="hier-row ${state.user.subrole === 'Member' ? 'on' : ''}"><span class="hier-dot"></span><strong>Member</strong><span>Executes assigned tasks</span></div>
        <div class="hier-row ${state.user.subrole === 'Intern' ? 'on' : ''}"><span class="hier-dot"></span><strong>Intern</strong><span>Tests alongside a supervisor</span></div>
      </div>
      ${
        canManageCatalog()
          ? `<p class="hint" style="margin-top:14px">${icon.check()} You can manage clients and applications in the Admin panel.</p>`
          : ''
      }
      <div class="field" style="margin-top:14px">
        <div class="field-label">Contact</div>
        ${contactLine(state.user.phone, state.user.email) || '<p class="hint">No contact details yet.</p>'}
      </div>
      <div class="field" style="margin-top:14px">
        <div class="field-label">Appearance</div>
        <div style="display:flex;gap:8px">
          <button class="btn" data-theme-set="light" style="flex:1">${icon.sun()} Light</button>
          <button class="btn" data-theme-set="dark" style="flex:1">${icon.moon()} Dark</button>
        </div>
      </div>`,
    footer: `<button class="btn" data-profile>${icon.user(13)} Edit contact</button>
      <button class="btn" data-password>${icon.lock()} Change password</button>
      <div class="spacer"></div>
      <button class="btn btn-danger" data-logout>${icon.logout()} Sign out</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-password]').addEventListener('click', () => {
        close();
        openPasswordForm();
      });
      modal.querySelector('[data-profile]').addEventListener('click', () => {
        close();
        openProfileForm();
      });
      modal.querySelectorAll('[data-theme-set]').forEach((b) =>
        b.addEventListener('click', () => {
          applyTheme(b.dataset.themeSet);
          const tb = document.getElementById('theme-btn');
          if (tb) tb.innerHTML = b.dataset.themeSet === 'dark' ? icon.sun() : icon.moon();
          toast(`Switched to ${b.dataset.themeSet} theme`);
        })
      );
      modal.querySelector('[data-logout]').addEventListener('click', async () => {
        close();
        await api.logout();
        state.user = null;
        renderAuth('login');
      });
    },
  });
}

/* ============================================================
   content: stats + filters + list
   ============================================================ */
function statsHTML() {
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

/** Clients as combobox items (label = full client name). */
function clientItems() {
  return state.clients.map((c) => ({ value: c.id, label: c.name, sub: c.shortName || '' }));
}

/**
 * Supervisors a client names as its usual owners.
 * Used to pre-select the SV when the client is picked in the project form.
 * Returns the raw client row so the caller can read `supervisors`.
 */
function clientById(clientId) {
  return state.clients.find((c) => Number(c.id) === Number(clientId)) || null;
}

/**
 * The people who may supervise, as combobox items.
 *
 * The pool mixes two hats now — a dedicated Supervisor account and a pentester who
 * runs an engagement — so each row says which one it is. Without that, "Rafi
 * Pratama" appearing in a supervisor list next to "Rina Kusuma" looks like a bug.
 */
function supervisorItems() {
  return (state.supervisors || []).map((m) => ({
    value: m.id,
    label: m.name,
    sub: m.role === PM_ROLE ? 'Project Manager' : 'Pentester',
  }));
}

/** Applications for one client as combobox items. */
function applicationItems(clientId) {
  const id = Number(clientId);
  if (!id) return [];
  return state.applications
    .filter((a) => Number(a.clientId) === id)
    .map((a) => ({ value: a.id, label: a.name, sub: '' }));
}

/** The variants of one application, for the project form's third picker. */
function variantItems(applicationId) {
  const id = Number(applicationId);
  if (!id) return [];
  const app = state.applications.find((a) => Number(a.id) === id);
  return (app?.variants || []).map((v) => ({ value: v.id, label: v.name }));
}

function applicationOptions(clientId, selectedId, placeholder) {
  const id = Number(clientId);
  if (!id) return `<option value="">${placeholder || 'Select a client first'}</option>`;
  const list = state.applications.filter((a) => Number(a.clientId) === id);
  if (!list.length) return '<option value="">No applications for this client yet</option>';
  return (
    `<option value="">Select an application…</option>` +
    list
      .map(
        (a) =>
          `<option value="${a.id}" ${Number(selectedId) === Number(a.id) ? 'selected' : ''}>${h(a.name)}</option>`
      )
      .join('')
  );
}

function filtersHTML() {
  const f = state.filters;
  return `
    <div class="filters">
      <div class="search">
        ${icon.search()}
        <input class="input" id="filter-q" placeholder="Filter by name, client, app or notes…" value="${h(f.q)}" autocomplete="off" />
      </div>
      <div class="filter-advanced">
        <select class="select" id="filter-clientId">
          <option value="">All clients</option>
          ${state.clients
            .map((c) => `<option value="${c.id}" ${String(f.clientId) === String(c.id) ? 'selected' : ''}>${h(c.name)}</option>`)
            .join('')}
        </select>
        <select class="select" id="filter-applicationId">
          ${applicationOptions(f.clientId, f.applicationId, 'All applications')}
        </select>
        <select class="select" id="filter-category">
          <option value="">All categories</option>
          ${propOptions('category')
            .map(
              (o) =>
                `<option value="${h(o.value)}" ${f.category === o.value ? 'selected' : ''}>${h(o.label)}</option>`
            )
            .join('')}
        </select>
        <select class="select" id="filter-status">
          <option value="">All statuses</option>
          ${propOptions('status')
            .map(
              (o) =>
                `<option value="${h(o.value)}" ${f.status === o.value ? 'selected' : ''}>${h(o.label)}</option>`
            )
            .join('')}
        </select>
      </div>
      <button class="btn btn-sm filter-toggle" type="button" id="filter-toggle">
        ${icon.filter()}<span>Filters</span>
      </button>
      <div class="toggle-group" style="margin-left:auto">
        <button data-view="grid" class="${state.view === 'grid' ? 'active' : ''}" aria-label="Grid view">${icon.grid()}</button>
        <button data-view="table" class="${state.view === 'table' ? 'active' : ''}" aria-label="Table view">${icon.list()}</button>
      </div>
    </div>`;
}

/**
 * Status order used by the server's `ORDER BY` for projects (Ongoing, Incoming,
 * Ready, Hold, Done, then anything an admin added). Mirrored here because the
 * expanded retest rows have to be placed in the same sequence: they arrive
 * attached to their project, and appending them there left an Ongoing retest
 * sitting below the Hold engagements.
 */
const STATUS_RANK = { Ongoing: 0, Incoming: 1, Ready: 2, Hold: 3, Done: 4 };

/**
 * The rows the Active list actually shows.
 *
 * One row per engagement, plus one row per OPEN retest of that engagement: a
 * project with two outstanding retests is three lines of work, not one. The
 * retest rows are not decorations — they carry their own status control, and
 * choosing a status there writes to the retest, not to the project.
 *
 * Done retests are left out: they are history, and the drawer keeps it.
 */
function listRows(list) {
  // Only the "active" workspaces expand: they answer "what is being worked on", and
  // an open retest is work. All projects stays a catalogue of engagements — it has
  // the retest counts in their own column.
  const expand = state.nav === 'active' || state.nav === 'mineActive';
  // In an active list a FINISHED engagement is not shown as itself: it is here
  // only because a retest is still pending, and that retest is the row that
  // represents the work. Showing both read as "Done project inside Active".
  // An explicit status filter wins, so asking for Done still lists Done.
  const hideDone = expand && !state.filters.status;
  const rows = [];
  list.forEach((p, order) => {
    if (!(hideDone && p.status === 'Done')) {
      rows.push({ key: `p${p.id}`, kind: 'project', project: p, status: p.status, at: order });
    }
    if (!expand) return;
    for (const r of p.openRetests || []) {
      // `at` sorts the retest by ITS OWN status, not by its project's: an Ongoing
      // retest of a Done engagement belongs in the Ongoing block, not at the
      // bottom of the list under whatever status the project happens to have.
      // The half-step keeps it directly beneath its project when the two share a
      // status, which is the case the grouping is for.
      rows.push({ key: `r${r.id}`, kind: 'retest', project: p, retest: r, status: r.status, at: order + 0.5 });
    }
  });
  if (!expand) return rows;
  // Sorted by status, then by the order the server already put the engagements in,
  // so projects keep their exact sequence and only the retest rows move.
  const rank = (status) => (status in STATUS_RANK ? STATUS_RANK[status] : 5);
  return rows.sort((a, b) => rank(a.status) - rank(b.status) || a.at - b.at);
}

/** Name of the thing a row represents: the project, or the retest of it. */
function rowLabel(row) {
  return row.kind === 'retest' ? `Retest - ${row.project.name}` : row.project.name;
}

function projectCardHTML(row) {
  const p = row.project;
  const isRetest = row.kind === 'retest';
  // A category the admin added has no palette entry of its own; the card still needs
  // a tint, so it borrows the neutral slate rather than pretending to be Web.
  const cat = CATEGORY[p.category] || { color: 'var(--slate)', soft: 'var(--slate-soft)' };
  return `
    <div class="pcard${isRetest ? ' pcard-retest' : ''}" data-project="${p.id}" role="button" tabindex="0"
            style="--cat-color:${cat.color};--cat-soft:${cat.soft}">
      <div class="pcard-top">
        <div class="cat-icon">${
          isRetest ? icon.refresh(17) : catIcon(p.category, 17)
        }</div>
        <div class="pcard-title">
          <h3>${h(rowLabel(row))}</h3>
          <div class="meta client-line">${icon.building(12)}<span>${h(p.client || 'No client')}${
            p.applicationName ? ` &ndash; ${h(p.applicationName)}` : ''
          }${p.variantName ? ` &ndash; ${h(p.variantName)}` : ''}</span></div>
          ${
            p.supervisorName
              ? `<div class="meta sv-line">${icon.userCheck(12)}<span>SV</span>${avatar(
                  p.supervisorName,
                  'sm',
                  p.supervisorId
                )}</div>`
              : ''
          }
        </div>
        ${quickStatus(row.status, isRetest ? row.retest.id : p.id, { kind: row.kind })}
      </div>
      <div class="pcard-badges">
        ${isRetest ? `<span class="badge" data-tone="cyan">Retest</span>` : ''}
        ${catBadge(p.category, p.platform)}
        ${envBadge(p.env)}
        ${methodBadge(p.method)}
      </div>
      <div class="pcard-foot">
        ${teamCell(p.pentesters, p.id)}
        <span class="spacer"></span>
        ${
          isRetest
            ? `<span class="foot-item has-open">${icon.refresh()} ${h(row.retest.code || 'Retest')}</span>`
            : p.retestCount
              ? `<span class="foot-item ${p.openRetestCount ? 'has-open' : ''}">
                   ${icon.refresh()} ${p.retestCount} retest${p.retestCount > 1 ? 's' : ''}
                 </span>`
              : `<span class="foot-item">${icon.refresh()} No retest</span>`
        }
      </div>
    </div>`;
}

function projectTableHTML(rows) {
  return `
    <div class="ptable-wrap">
      <table class="ptable">
        <thead>
          <tr>
            <th>Project</th>
            <th>Category</th>
            <th class="hide-md" title="Supervisor">SV</th>
            <th class="hide-md">Pentesters</th>
            <th>Retests</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr data-project="${row.project.id}"${
              row.kind === 'retest' ? ' class="prow-retest"' : ''
            }>
              <td class="cell-name">${h(rowLabel(row))}${
                // The client lives under the project name as "Client – App – Sub
                // app", so the list loses a whole column without losing the
                // information. One breadcrumb, one colour: the sub app is part of
                // where this engagement sits, not a tag on it.
                row.project.client
                  ? `<div class="sub">${h(row.project.client)}${
                      row.project.applicationName ? ` &ndash; ${h(row.project.applicationName)}` : ''
                    }${row.project.variantName ? ` &ndash; ${h(row.project.variantName)}` : ''}</div>`
                  : row.project.applicationName
                    ? `<div class="sub">${h(row.project.applicationName)}${
                        row.project.variantName ? ` &ndash; ${h(row.project.variantName)}` : ''
                      }</div>`
                    : ''
              }</td>
              <td>${catBadge(row.project.category, row.project.platform)}</td>
              <td class="hide-md cell-pm">${supervisorCell(
                { id: row.project.supervisorId, name: row.project.supervisorName },
                'sm'
              )}</td>
              <td class="hide-md cell-team">${teamCell(row.project.pentesters, row.project.id)}</td>
              <td>${
                row.kind === 'retest'
                  ? `<span class="badge" data-tone="cyan">Retest</span>`
                  : row.project.retestCount
                    ? `<span class="badge ${row.project.openRetestCount ? 'pulse' : ''}" data-tone="${
                        row.project.openRetestCount ? 'cyan' : 'slate'
                      }">${row.project.retestCount}</span>`
                    : '<span class="dash">—</span>'
              }</td>
              <td class="cell-status">${quickStatus(
                row.status,
                row.kind === 'retest' ? row.retest.id : row.project.id,
                { kind: row.kind }
              )}</td>
              <td class="cell-actions">
                <span class="btn btn-icon" style="width:28px;height:28px">${icon.chevronRight()}</span>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** True when any filter control deviates from its default. */
function hasActiveFilters() {
  return Boolean(
    state.filters.q ||
      state.filters.status ||
      state.filters.category ||
      state.filters.clientId ||
      state.filters.applicationId
  );
}

function emptyHTML() {
  const filtered = hasActiveFilters();
  const mine = state.nav === 'mineActive' || state.nav === 'mineAll';
  return `<div class="empty">
    <div class="icon">${icon.layers()}</div>
    <h3>${
      filtered
        ? 'No projects match your filters'
        : mine
          ? 'Nothing assigned to you yet'
          : 'No projects yet'
    }</h3>
    <p>${
      filtered
        ? 'Try clearing the search or filter chips to see more results.'
        : mine
          ? state.nav === 'mineActive'
            ? 'You have no engagement in flight. Switch to My all projects to see finished ones.'
            : 'A lead or sub lead can assign you to an engagement from the project form or the team board.'
          : 'Create your first engagement to start tracking scope, assigned pentesters, and client retests.'
    }</p>
    ${
      filtered
        ? `<button class="btn" id="clear-filters">${icon.x()} Clear filters</button>`
        : `<button class="btn btn-primary" id="empty-new">${icon.plus()} New project</button>`
    }
  </div>`;
}

const PAGE_SIZES = [50, 100, 200, 0];

/**
 * The slice of rows the current page shows, and the bookkeeping the pager needs.
 *
 * Paging is applied to the ROWS, not to the projects: a page of 50 means fifty
 * lines of work, retest rows included, which is what the operator counts when
 * they scroll. `0` in the size picker means "all" and is kept as an explicit
 * choice rather than a magic large number.
 */
function pageSlice(rows) {
  const size = state.pageSize > 0 ? state.pageSize : rows.length || 1;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(Math.max(1, state.page || 1), pages);
  state.page = page;
  const from = (page - 1) * size;
  return { slice: rows.slice(from, from + size), page, pages, total: rows.length, from, size };
}

/**
 * Prev / next / first / last, the page count, and the rows-per-page picker.
 *
 * One page of results needs no controls at all: showing "Page 1 of 1" over three
 * rows is noise, so the bar only appears when there is something to page — but the
 * size picker stays, because that is how someone gets back to a smaller page after
 * choosing "All".
 */
function pagerHTML({ total, page, pages, from, size }) {
  const shown = Math.min(total - from, size);
  const range = total ? `${from + 1}–${from + shown}` : '0';
  const nav = (target, label, disabled, title) =>
    `<button class="btn btn-sm pager-btn" data-page="${target}" ${
      disabled ? 'disabled' : ''
    } aria-label="${title}" title="${title}">${label}</button>`;

  return `<div class="pager">
      <span class="pager-info">Showing <strong>${range}</strong> of <strong>${total}</strong></span>
      <span class="spacer"></span>
      <label class="pager-size">
        Rows per page
        <select id="page-size" class="select select-sm">
          ${[...new Set([...PAGE_SIZES, state.pageSize])]
            .sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
            .map(
              (n) => `<option value="${n}" ${n === state.pageSize ? 'selected' : ''}>${
                n === 0 ? 'All' : n
              }</option>`
            )
            .join('')}
        </select>
      </label>
      ${
        pages > 1
          ? `<div class="pager-nav">
               ${nav(1, '« First', page === 1, 'First page')}
               ${nav(page - 1, '‹ Prev', page === 1, 'Previous page')}
               <span class="pager-page">Page <strong>${page}</strong> of ${pages}</span>
               ${nav(page + 1, 'Next ›', page === pages, 'Next page')}
               ${nav(pages, 'Last »', page === pages, 'Last page')}
             </div>`
          : ''
      }
    </div>`;
}

function resultsHTML() {
  const statusFilterForRows = state.filters.status;
  // The server filters the engagements by status; a retest row carries its OWN
  // status, so it has to answer the same filter for itself or a "Done" filter
  // would list open retests.
  const rows = listRows(state.projects).filter(
    (r) => r.kind !== 'retest' || !statusFilterForRows || r.status === statusFilterForRows
  );
  const retestRows = rows.filter((r) => r.kind === 'retest').length;
  const projectRows = rows.length - retestRows;
  const paged = pageSlice(rows);
  // A status filter overrides the scope both in the payload and in the copy, so
  // the heading can never advertise "Active projects" while showing Done rows.
  const statusFilter = state.filters.status;
  const navLabel = statusFilter
    ? ''
    : (state.nav === 'active' || state.nav === 'mineActive')
      ? 'active'
      : '';
  return `
    <div class="result-bar">
      <strong>${projectRows}</strong> project${projectRows === 1 ? '' : 's'}
      ${retestRows ? `<span class="badge" data-tone="cyan">+${retestRows} retest${retestRows === 1 ? '' : 's'}</span>` : ''}
      ${navLabel ? `<span class="badge" data-tone="amber">${navLabel}</span>` : ''}
      ${statusFilter ? `<span class="badge" data-tone="blue">status: ${h(statusFilter)}</span>` : ''}
      <span class="spacer" style="margin-left:auto"></span>
      ${hasActiveFilters() ? `<button class="btn btn-sm btn-quiet" id="clear-filters">${icon.x(13)} Clear</button>` : ''}
      <span style="font-size:12px;color:var(--faint)">${state.view === 'grid' ? 'Card view' : 'Table view'}</span>
    </div>
    ${
      state.loading && !state.projects.length
        ? `<div class="project-grid">${'<div class="skeleton"></div>'.repeat(6)}</div>`
        : rows.length === 0
        ? emptyHTML()
        : state.view === 'grid'
        ? `<div class="project-grid">${paged.slice.map(projectCardHTML).join('')}</div>`
        : projectTableHTML(paged.slice)
    }
    ${rows.length ? pagerHTML(paged) : ''}`;
}

/* Mounts the stable chrome (stats + filters) once, or the admin panel. */
function mountContent() {
  const content = document.getElementById('content');
  if (!content) return;

  if (state.nav === 'clients') {
    content.innerHTML = adminHTML();
    bindAdmin();
    setTitle(NAV.clients.title, NAV.clients.sub);
    return;
  }

  if (state.nav === 'users') {
    content.innerHTML = usersHTML();
    bindUsers();
    setTitle(NAV.accounts.title, NAV.accounts.sub);
    return;
  }

  if (state.nav === 'directory') {
    content.innerHTML = directoryHTML();
    bindDirectory();
    setTitle(NAV.directory.title, NAV.directory.sub);
    return;
  }

  if (state.nav === 'properties') {
    content.innerHTML = propertiesHTML();
    bindProperties();
    setTitle(NAV.properties.title, NAV.properties.sub);
    return;
  }

  if (state.nav === 'team') {
    content.innerHTML = teamHTML();
    bindTeam();
    setTitle(NAV.team.title, NAV.team.sub);
    return;
  }

  if (state.nav === 'devices') {
    content.innerHTML = devicesHTML();
    bindDevices();
    setTitle(NAV.devices.title, NAV.devices.sub);
    return;
  }

  if (state.nav === 'info') {
    content.innerHTML = infoHTML();
    bindInfo();
    bindDocs();
    setTitle(NAV.info.title, NAV.info.sub);
    return;
  }

  if (content.querySelector('#results')) {
    // The stat cards are scope-dependent ("My ..." counts only your work), so
    // they have to be repainted whenever the scope changes — refreshing only
    // #results left the previous scope's numbers sitting above a different list.
    const stats = document.getElementById('stats');
    if (stats) stats.innerHTML = statsHTML();
    renderResults();
    return;
  }
  content.innerHTML = `
    <div id="stats">${statsHTML()}</div>
    <div class="filters-wrap">${filtersHTML()}</div>
    <div id="results"></div>`;
  bindFilters();
  renderResults();
}

function renderResults() {
  const host = document.getElementById('results');
  if (!host) return mountContent();

  const def = NAV[state.nav];
  const statusFilter = state.filters.status;
  if (def) {
    if (statusFilter) {
      setTitle(`${def.title} · ${statusFilter}`, `Showing only ${statusFilter} projects in this scope`);
    } else {
      setTitle(def.title, def.sub);
    }
  }

  host.innerHTML = resultsHTML();
  host.querySelectorAll('[data-project]').forEach((el) => {
    el.addEventListener('click', (e) => {
      // A click on the status menu must not also open the project.
      if (e.target.closest('[data-quick-status]')) return;
      // Neither must a click on a person's avatar: that opens their card.
      const person = e.target.closest('[data-person]');
      if (person) {
        e.stopPropagation();
        e.preventDefault();
        // Compact: you clicked a face on a PROJECT row, so the project is the
        // subject. Listing every engagement that person is on buries the reason
        // you clicked; the full card is a click away on the team board.
        openPerson(Number(person.dataset.person), { compact: true });
        return;
      }
      openProject(Number(el.dataset.project));
    });
    // The card is a div with role=button so it can legally contain the status
    // button; that means keyboard activation has to be wired by hand.
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('[data-quick-status]')) return;
        const person = e.target.closest('[data-person]');
        if (person) {
          e.preventDefault();
          e.stopPropagation();
          openPerson(Number(person.dataset.person), { compact: true });
          return;
        }
        e.preventDefault();
        openProject(Number(el.dataset.project));
      }
    });
  });
  bindQuickStatus(host);
  // Quick "assign pentesters" button in the list's Pentesters column. It opens a
  // modal that holds ONLY the picker — the full project form would be a lot of
  // noise when all you want is to add a name. stopPropagation keeps the row
  // click from also opening the drawer.
  host.querySelectorAll('[data-team-quick]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const project = state.projects.find((p) => Number(p.id) === Number(btn.dataset.teamQuick));
      if (project) openTeamForm(project);
    });
  });
  document.getElementById('clear-filters')?.addEventListener('click', clearFilters);
  document.getElementById('empty-new')?.addEventListener('click', () => openProjectForm());

  // Paging. The pager lives inside #results, which is re-created on every render,
  // so its listeners are bound here with the rest of the list's controls.
  host.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = Number(btn.dataset.page);
      if (!Number.isFinite(next) || next < 1) return;
      // `'next'`-style targets are resolved in pagerHTML, so this is always a
      // concrete page number — no wrapping logic needed here.
      state.page = next;
      renderResults();
      // A phone user paging from the bottom of a long list should land on the top
      // of the next page, not halfway down it.
      document.getElementById('results')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  });

  host.querySelector('#page-size')?.addEventListener('change', (e) => {
    const size = Number(e.target.value);
    state.pageSize = Number.isFinite(size) && size >= 0 ? size : 50;
    localStorage.setItem('opm-page-size', String(state.pageSize));
    state.page = 1;
    renderResults();
  });
}

/**
 * One-click status change. Applied to every quick-status control inside `host`:
 * opening a menu closes any other, picking an option PATCHes the project and
 * re-renders just the results list so the row keeps its scroll position.
 */
/**
 * Places an open status menu next to its toggle.
 *
 * The menu is `position: fixed` so that it escapes clipping ancestors — most
 * importantly `.ptable-wrap`, which has `overflow-x: auto` and used to clip the
 * menu in table view so that no status item was clickable. Fixed positioning
 * means we must write explicit viewport coordinates ourselves.
 */
function placeMenu(menu, toggle) {
  if (!menu || !toggle) return;

  // Portal the menu into <body>. `position: fixed` is not enough on its own:
  // `.pcard:hover` applies `transform: translateY(-2px)`, and a transformed
  // ancestor becomes the containing block for fixed children — so the menu was
  // being positioned relative to the card and landed far off-screen. Parking the
  // node under <body> guarantees the viewport is the containing block.
  if (menu.parentElement !== document.body) {
    menu._qsHome = toggle.closest('[data-quick-status]');
    menu.setAttribute('data-quick-menu', '');
    document.body.appendChild(menu);
  }

  const box = toggle.getBoundingClientRect();
  const menuH = menu.offsetHeight;
  const menuW = menu.offsetWidth;
  const GAP = 6;
  const MARGIN = 8;

  const roomBelow = window.innerHeight - box.bottom - GAP;
  const roomAbove = box.top - GAP;
  const flip = roomBelow < menuH && roomAbove > roomBelow;
  menu.classList.toggle('up', flip);

  let top = flip ? box.top - GAP - menuH : box.bottom + GAP;
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - menuH - MARGIN));

  let left = box.left;
  if (left + menuW > window.innerWidth - MARGIN) left = box.right - menuW;
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - menuW - MARGIN));

  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(left)}px`;
}

/**
 * Hides a status menu and returns it to the card it belongs to, so the next
 * render can replace it normally instead of leaving an orphan in <body>.
 */
function hideMenu(menu) {
  menu.hidden = true;
  menu.style.top = '';
  menu.style.left = '';
  const home = menu._qsHome;
  if (home && home.isConnected && menu.parentElement === document.body) {
    home.appendChild(menu);
  }
}

function bindQuickStatus(host) {
  const closeAll = (except) => {
    host.querySelectorAll('.quick-status-menu').forEach((m) => {
      if (m !== except) {
        hideMenu(m);
        m.closest('.pcard')?.classList.remove('menu-open');
      }
    });
  };

  host.querySelectorAll('[data-quick-toggle]').forEach((toggle) => {
    const wrap = toggle.closest('[data-quick-status]');
    const menu = wrap.querySelector('.quick-status-menu');

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.hidden;
      closeAll(menu);
      menu.hidden = !willOpen;
      if (willOpen) {
        wrap.closest('.pcard')?.classList.add('menu-open');
        placeMenu(menu, toggle);
      }
    });
  });

  host.querySelectorAll('[data-set-status]').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(item.dataset.statusFor);
      const status = item.dataset.setStatus;
      const kind = item.dataset.statusKind || 'project';
      hideMenu(item.closest('.quick-status-menu'));
      item.closest('.pcard')?.classList.remove('menu-open');
      try {
        // A retest row on the Active list stands for ONE retest request, so its
        // status control writes to that request. It used to patch the project,
        // which changed the engagement while the row kept showing the retest.
        if (kind === 'retest') {
          await api.updateRetest(id, { status });
          toast(`Retest status changed to ${status}`);
        } else {
          await api.updateProject(id, { status });
          toast(`Status changed to ${status}`);
        }
        await Promise.all([loadStats(), loadProjects()]);
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });

  // One document-level pair for the whole page load, not one per `#results`: the
  // guard used to live on `host`, and `host` is re-created on every navigation, so
  // each visit to a project list added another pair that outlived the rows it was
  // closing menus for.
  if (!window.__qsDocBound) {
    window.__qsDocBound = true;
    document.addEventListener('mousedown', (e) => {
      // The open menu lives in <body> (portal), so a click on one of its items
      // is NOT inside [data-quick-status] — it must be excluded explicitly or
      // the menu would close on mousedown and the item click would be lost.
      if (e.target.closest('[data-quick-status]') || e.target.closest('[data-quick-menu]')) return;
      document.querySelectorAll('.quick-status-menu').forEach(hideMenu);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.quick-status-menu:not([hidden])').forEach(hideMenu);
      }
    });
  }
}

function clearFilters() {
  state.filters = { q: '', status: '', category: '', env: '', method: '', clientId: '', applicationId: '' };
  const q = document.getElementById('filter-q');
  if (q) q.value = '';
  const sTop = document.getElementById('search-input');
  if (sTop) sTop.value = '';
  const clientSel = document.getElementById('filter-clientId');
  if (clientSel) clientSel.value = '';
  const appSel = document.getElementById('filter-applicationId');
  if (appSel) appSel.innerHTML = applicationOptions('', '', 'All applications');
  for (const key of ['category', 'status']) {
    const el = document.getElementById(`filter-${key}`);
    if (el) el.value = '';
  }
  document.getElementById('filter-toggle')?.classList.remove('btn-primary');

  if (state.nav !== 'all') {
    state.nav = 'all';
    document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'all'));
  }
  loadProjects();
}

function bindFilters() {
  const q = document.getElementById('filter-q');
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.filters.q = q.value.trim();
      const top = document.getElementById('search-input');
      if (top && top.value !== state.filters.q) top.value = state.filters.q;
      loadProjects();
    }, 160);
  });

  // Client drives the application dropdown, so it is handled separately.
  document.getElementById('filter-clientId')?.addEventListener('change', (e) => {
    state.filters.clientId = e.target.value;
    state.filters.applicationId = '';
    const appSel = document.getElementById('filter-applicationId');
    if (appSel) appSel.innerHTML = applicationOptions(state.filters.clientId, '', 'All applications');
    syncFilterToggle();
    loadProjects();
  });

  for (const key of ['applicationId', 'category', 'status']) {
    document.getElementById(`filter-${key}`)?.addEventListener('change', (e) => {
      state.filters[key] = e.target.value;
      syncFilterToggle();
      loadProjects();
    });
  }

  document.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => {
      state.view = b.dataset.view;
      localStorage.setItem('opm-view', state.view);
      document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('active', x === b));
      renderResults();
    })
  );

  const ft = document.getElementById('filter-toggle');
  if (ft) {
    syncFilterToggle();
    if (state.filtersOpen) document.querySelector('.filters')?.classList.add('open');
    ft.addEventListener('click', () => {
      const box = document.querySelector('.filters');
      box.classList.toggle('open');
      state.filtersOpen = box.classList.contains('open');
    });
  }
}

function syncFilterToggle() {
  const ft = document.getElementById('filter-toggle');
  if (!ft) return;
  // Assigned-to-me is a sidebar scope now, not a filter chip, so it is not
  // counted here: the active nav item already shows the scope.
  const n = ['clientId', 'applicationId', 'category', 'status'].filter((k) => state.filters[k]).length;
  ft.classList.toggle('btn-primary', n > 0);
}

/* ============================================================
   admin panel — clients & applications
   ============================================================ */
function adminHTML() {
  if (!state.clients.length) {
    return `<div class="admin">
      <div class="admin-head">
        <p>Every project belongs to a client and one of that client's applications.</p>
        <span class="admin-head-actions">
          <button class="btn" data-client-import>${icon.upload(13)} Import</button>
          <button class="btn btn-primary" id="admin-add-client">${icon.plus()} New client</button>
        </span>
      </div>
      <div class="empty">
        <div class="icon">${icon.building(28)}</div>
        <h3>No clients yet</h3>
        <p>Add a client first, then add the applications you pentest for them.</p>
        <button class="btn btn-primary" id="admin-add-client">${icon.plus()} New client</button>
      </div>
    </div>`;
  }

  return `<div class="admin">
    <div class="admin-head">
      <p>Every project belongs to a client and one of that client's applications.</p>
      <span class="admin-head-actions">
        <button class="btn" data-client-import>${icon.upload(13)} Import</button>
        <button class="btn btn-primary" id="admin-add-client">${icon.plus()} New client</button>
      </span>
    </div>
    <div class="client-grid">
      ${state.clients.map(clientCardHTML).join('')}
    </div>
  </div>`;
}

/**
 * One application inside a client card, plus its sub apps.
 *
 * A sub app (also "variant") is the optional third level, Client → Application →
 * Sub app: a separate product delivered under the same application, named by the
 * team. `Brilink` has `Brilink MPOS`, `Brilink Mobile` and `Brilink Web`; they are
 * three things you test separately, not three builds of one thing. An application
 * with no sub apps shows one quiet "+ Sub app" line and nothing else, because the
 * level is optional and must not read like a missing field.
 */
function applicationBlockHTML(a) {
  const variants = a.variants || [];
  return `
    <div class="app-block">
      <div class="app-row">
        <span class="app-glyph">${icon.apps()}</span>
        <span class="app-name">${h(a.name)}</span>
        <span class="app-count">${a.projectCount} project${a.projectCount === 1 ? '' : 's'}</span>
        <button class="app-act" data-app-edit="${a.id}" aria-label="Rename application">${icon.edit()}</button>
        <button class="app-act" data-variant-add="${a.id}" aria-label="Add a sub app to ${h(a.name)}">${icon.plus()}</button>
        <button class="app-act danger" data-app-del="${a.id}" aria-label="Delete application">${icon.trash()}</button>
      </div>
      <div class="variant-list">
        ${variants.map((v) => variantRowHTML(v)).join('')}
        <button class="variant-add" data-variant-add="${a.id}">${icon.plus()} Sub app</button>
      </div>
    </div>`;
}

function variantRowHTML(v) {
  return `
    <div class="variant-row">
      <span class="variant-name">${h(v.name)}</span>
      <span class="variant-count">${v.projectCount} project${v.projectCount === 1 ? '' : 's'}</span>
      <button class="app-act" data-variant-edit="${v.id}" aria-label="Edit sub app ${h(v.name)}">${icon.edit()}</button>
      <button class="app-act danger" data-variant-del="${v.id}" aria-label="Delete sub app ${h(v.name)}">${icon.trash()}</button>
    </div>`;
}

function clientCardHTML(c) {
  const apps = state.applications.filter((a) => Number(a.clientId) === Number(c.id));
  return `
    <div class="client-card" data-client="${c.id}">
      <div class="client-card-head">
        <div class="cc-avatar">${h(initials(c.name))}</div>
        <div class="cc-title">
          <h3>${h(c.name)}</h3>
          <div class="cc-meta">
            ${c.shortName ? `<span class="tag">${h(c.shortName)}</span>` : ''}
            <span>${c.applicationCount} app${c.applicationCount === 1 ? '' : 's'}</span>
            <span>${c.projectCount} project${c.projectCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="cc-actions">
          <button class="btn btn-icon" data-client-edit="${c.id}" aria-label="Edit client">${icon.edit()}</button>
          <button class="btn btn-icon danger" data-client-del="${c.id}" aria-label="Delete client">${icon.trash()}</button>
        </div>
      </div>
      <div class="app-list">
        ${
          apps.length
            ? apps.map(applicationBlockHTML).join('')
            : '<div class="app-empty">No applications yet — add the first one.</div>'
        }
      </div>
      <div class="cc-supervisors">
        <span class="cc-m-label">${icon.userCheck(12)} Default SV</span>
        ${
          (c.supervisors || []).length
            ? `<span class="cc-m-list">${c.supervisors
                .map((m) => `<span class="cc-m-chip" title="${h(m.email || '')}">${h(m.name)}</span>`)
                .join('')}</span>`
            : `<span class="cc-m-empty">None — set one so new projects auto-assign a SV</span>`
        }
      </div>
      <button class="btn btn-sm app-add" data-app-add="${c.id}">${icon.plus()} Add application</button>
    </div>`;
}

function bindAdmin() {
  document.querySelectorAll('#admin-add-client').forEach((b) => b.addEventListener('click', () => openClientForm()));
  document.querySelectorAll('[data-client-import]').forEach((b) => b.addEventListener('click', () => openClientImport()));
  document.querySelectorAll('[data-client-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openClientForm(state.clients.find((c) => Number(c.id) === Number(b.dataset.clientEdit)))
    )
  );
  document.querySelectorAll('[data-client-del]').forEach((b) =>
    b.addEventListener('click', () => deleteClient(state.clients.find((c) => Number(c.id) === Number(b.dataset.clientDel))))
  );
  document.querySelectorAll('[data-app-add]').forEach((b) =>
    b.addEventListener('click', () => openApplicationForm(Number(b.dataset.appAdd)))
  );
  document.querySelectorAll('[data-app-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openApplicationForm(null, state.applications.find((a) => Number(a.id) === Number(b.dataset.appEdit)))
    )
  );
  document.querySelectorAll('[data-app-del]').forEach((b) =>
    b.addEventListener('click', () =>
      deleteApplication(state.applications.find((a) => Number(a.id) === Number(b.dataset.appDel)))
    )
  );
  document.querySelectorAll('[data-variant-add]').forEach((b) =>
    b.addEventListener('click', () => openVariantForm(Number(b.dataset.variantAdd)))
  );
  document.querySelectorAll('[data-variant-edit]').forEach((b) =>
    b.addEventListener('click', () => openVariantForm(null, findVariant(b.dataset.variantEdit)))
  );
  document.querySelectorAll('[data-variant-del]').forEach((b) =>
    b.addEventListener('click', () => deleteVariant(findVariant(b.dataset.variantDel)))
  );
}

/** Variants live inside their application in state.applications, not in a flat list. */
function findVariant(id) {
  const wanted = Number(id);
  for (const app of state.applications) {
    const hit = (app.variants || []).find((v) => Number(v.id) === wanted);
    if (hit) return hit;
  }
  return null;
}

function openVariantForm(applicationId = null, variant = null) {
  const editing = Boolean(variant);
  const appId = variant ? Number(variant.applicationId) : Number(applicationId);
  const app = state.applications.find((a) => Number(a.id) === appId);
  if (!app) return toast('Application not found', 'err');
  openModal({
    title: editing ? 'Edit sub app' : 'New sub app',
    subtitle: app.name,
    body: `
      <div class="field">
        <label for="v-name">Sub app name <span class="required">*</span></label>
        <input class="input" id="v-name" placeholder="e.g. Brilink MPOS, Brilink Mobile, Brilink Web" value="${h(variant?.name || '')}" />
        <span class="hint">
          A sub app is a separate product under the same application, named however
          the team names it. Projects point at a sub app when the engagement is about
          it instead of the application as a whole.
        </span>
      </div>
      <div class="field">
        <label for="v-notes">Notes</label>
        <textarea class="textarea" id="v-notes" rows="2" placeholder="Optional">${h(variant?.notes || '')}</textarea>
      </div>`,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Add sub app'}</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      modal.querySelector('[data-save]').addEventListener('click', async () => {
        const name = modal.querySelector('#v-name').value.trim();
        if (!name) return toast('Sub app name is required', 'err');
        const payload = { name, notes: modal.querySelector('#v-notes').value };
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          if (editing) await api.updateVariant(variant.id, payload);
          else await api.createVariant(appId, payload);
          toast(editing ? 'Sub app updated' : 'Sub app added');
          close();
          await refreshCatalog();
          await refreshAll();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    },
  });
}

async function deleteVariant(variant) {
  if (!variant) return;
  const ok = await confirmDialog({
    title: 'Delete sub app?',
    message: `"${variant.name}" will be removed, with any notes filed on it. Projects that point at it keep their application, but lose the sub app.`,
    confirmLabel: 'Delete sub app',
  });
  if (!ok) return;
  try {
    await api.deleteVariant(variant.id);
    toast('Sub app deleted');
    await refreshCatalog();
    await refreshAll();
  } catch (err) {
    toast(err.message, 'err');
  }
}

function openClientForm(client = null) {
  const editing = Boolean(client);
  openModal({
    title: editing ? 'Edit client' : 'New client',
    subtitle: editing ? client.name : 'A client owns one or more applications',
    body: `
      <div class="field">
        <label for="c-name">Client name <span class="required">*</span></label>
        <input class="input" id="c-name" placeholder="e.g. Bank Nusantara" value="${h(client?.name || '')}" />
      </div>
      <div class="field">
        <label for="c-short">Short name</label>
        <input class="input" id="c-short" placeholder="e.g. BN" value="${h(client?.shortName || '')}" maxlength="12" />
        <span class="hint">Shown on project cards and in the table to save space.</span>
      </div>
      <div class="field">
        <div class="field-label">Usual supervisors</div>
        ${supervisorPickerHTML((client?.supervisors || []).map((m) => m.id))}
        <span class="hint">
          When you create a project for this client, its SV is pre-selected from
          this list. Several are allowed — the project still has one owner.
        </span>
      </div>
      <div class="field">
        <label for="c-notes">Notes</label>
        <textarea class="textarea" id="c-notes" rows="3" placeholder="Primary contact, engagement rules…">${h(client?.notes || '')}</textarea>
      </div>`,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Create client'}</button>`,
    onMount: (modal, close) => {
      bindPicker(modal);
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      modal.querySelector('[data-save]').addEventListener('click', async () => {
        const name = modal.querySelector('#c-name').value.trim();
        if (!name) return toast('Client name is required', 'err');
        const payload = {
          name,
          shortName: modal.querySelector('#c-short').value.trim(),
          notes: modal.querySelector('#c-notes').value,
          supervisorIds: pickerValues(modal),
        };
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          if (editing) await api.updateClient(client.id, payload);
          else await api.createClient(payload);
          toast(editing ? 'Client updated' : 'Client created');
          close();
          await refreshCatalog();
          await refreshAll();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    },
  });
}

async function deleteClient(client) {
  if (!client) return;
  const ok = await confirmDialog({
    title: 'Delete client?',
    message: `"${client.name}" and its ${client.applicationCount} application(s) will be removed.`,
    confirmLabel: 'Delete client',
  });
  if (!ok) return;
  try {
    await api.deleteClient(client.id);
    toast('Client deleted');
    await refreshCatalog();
    await refreshAll();
  } catch (err) {
    toast(err.message, 'err');
  }
}

function openApplicationForm(clientId = null, application = null) {
  const editing = Boolean(application);
  const ownerId = application ? Number(application.clientId) : Number(clientId);
  openModal({
    title: editing ? 'Edit application' : 'New application',
    subtitle: state.clients.find((c) => Number(c.id) === ownerId)?.name || '',
    body: `
      <div class="field">
        <label for="a-client">Client <span class="required">*</span></label>
        <select class="select" id="a-client">
          ${state.clients
            .map((c) => `<option value="${c.id}" ${Number(c.id) === ownerId ? 'selected' : ''}>${h(c.name)}</option>`)
            .join('')}
        </select>
      </div>
      <div class="field">
        <label for="a-name">Application name <span class="required">*</span></label>
        <input class="input" id="a-name" placeholder="e.g. Qitta, Brimo, Brilink" value="${h(application?.name || '')}" />
        <span class="hint">One application per web app, mobile app, API or EDC fleet.</span>
      </div>
      <div class="field">
        <label for="a-notes">Notes</label>
        <textarea class="textarea" id="a-notes" rows="2" placeholder="Optional">${h(application?.notes || '')}</textarea>
      </div>`,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Add application'}</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      modal.querySelector('[data-save]').addEventListener('click', async () => {
        const name = modal.querySelector('#a-name').value.trim();
        if (!name) return toast('Application name is required', 'err');
        const payload = {
          clientId: Number(modal.querySelector('#a-client').value),
          name,
          notes: modal.querySelector('#a-notes').value,
        };
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          if (editing) await api.updateApplication(application.id, payload);
          else await api.createApplication(payload);
          toast(editing ? 'Application updated' : 'Application added');
          close();
          await refreshCatalog();
          await refreshAll();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    },
  });
}

async function deleteApplication(app) {
  if (!app) return;
  const ok = await confirmDialog({
    title: 'Delete application?',
    message: `"${app.name}" will be removed from the client catalogue.`,
    confirmLabel: 'Delete application',
  });
  if (!ok) return;
  try {
    await api.deleteApplication(app.id);
    toast('Application deleted');
    await refreshCatalog();
    await refreshAll();
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* ============================================================
   data
   ============================================================ */
async function refreshCatalog() {
  const [clientsRes, appsRes] = await Promise.all([api.clients(), api.applications()]);
  state.clients = clientsRes.clients;
  state.applications = appsRes.applications;
}

async function loadStats() {
  state.stats = await api.stats();
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.outerHTML = sidebarHTML();
  bindSidebar();
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.nav));
  const statsHost = document.getElementById('stats');
  if (statsHost) statsHost.innerHTML = statsHTML();
}

function bindSidebar() {
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => handleNav(btn.dataset.nav));
  });
  document.getElementById('user-chip')?.addEventListener('click', openAccountMenu);
}

/**
 * Guards a loader against answering out of order.
 *
 * Every list on this page is reloaded by more than one trigger — typing in the
 * search box (debounced), clicking a nav item, saving a status, a property change
 * that renames a chip. Two of those can overlap trivially, and the slower one used
 * to win: an older response overwrote a newer one and repainted stale rows. The
 * sequence number is per key, so the project list and the device list cannot
 * invalidate each other.
 */
const loadSeq = new Map();

function nextLoadToken(key) {
  const token = (loadSeq.get(key) || 0) + 1;
  loadSeq.set(key, token);
  return token;
}

function isCurrentLoad(key, token) {
  return loadSeq.get(key) === token;
}

/** Translates the current nav + filters into API query parameters. */
function currentQuery() {
  const query = { ...state.filters };
  // Active = still in flight. The server decides this — a finished engagement is
  // still RETURNED when it owes a retest, because its open retest rows need it,
  // and listRows() drops the project row itself. The client only passes the flag.
  // An explicit status filter wins: the sidebar's Finished page is gone, so the
  // status select is the only way to reach Done, and the scope must not veto it.
  if ((state.nav === 'active' || state.nav === 'mineActive') && !query.status) query.activeOnly = '1';
  if (state.nav === 'mineActive' || state.nav === 'mineAll') query.mine = '1';
  return query;
}

async function loadProjects() {
  // Only show the skeleton when there is nothing on screen yet. Re-rendering
  // the whole grid on every keystroke/click doubled the DOM work and made the
  // UI feel laggy, because the previous results were torn down and rebuilt
  // twice within a few milliseconds.
  const cold = !state.projects.length;
  if (cold) {
    state.loading = true;
    renderResults();
  }
  document.getElementById('results')?.classList.add('is-refreshing');
  const token = nextLoadToken('projects');
  try {
    const query = currentQuery();
    const sig = JSON.stringify(query);
    if (sig !== state.pageSig) {
      state.pageSig = sig;
      state.page = 1;
    }
    const res = await api.projects(query);
    // A newer request has already been fired: its answer is the truth, so this
    // one is dropped instead of overwriting it.
    if (!isCurrentLoad('projects', token)) return;
    state.projects = res.projects;
  } catch (err) {
    if (!isCurrentLoad('projects', token)) return;
    toast(err.message, 'err');
  } finally {
    if (isCurrentLoad('projects', token)) {
      state.loading = false;
      document.getElementById('results')?.classList.remove('is-refreshing');
      renderResults();
    }
  }
}

async function refreshAll() {
  await Promise.all([loadStats(), loadProjects()]);
  const content = document.getElementById('content');
  if (!content) return;
  if (state.nav === 'clients') {
    content.innerHTML = adminHTML();
    bindAdmin();
  }
  if (state.nav === 'users') {
    content.innerHTML = usersHTML();
    bindUsers();
  }
  if (state.nav === 'properties') {
    content.innerHTML = propertiesHTML();
    bindProperties();
  }
}


/* ============================================================
   Information center — free-form notes per client / application
   ============================================================ */

/** Group label chips: a note may name any category; we only style known ones. */
const INFO_TONE = {
  Credential: 'rose',
  Credentials: 'rose',
  'Common Error': 'amber',
  Errors: 'amber',
  Link: 'cyan',
  Links: 'cyan',
  'Useful Link': 'cyan',
  General: 'slate',
  Access: 'violet',
  Config: 'blue',
};

function infoTone(category) {
  return INFO_TONE[category] || 'slate';
}

/** The picker list: every client, then that client's applications beneath it. */
/* ============================================================
   Devices — the hardware inventory
   ============================================================ */

/**
 * Which field of a device reads best as its subtitle in the compact views.
 * A name alone is not enough to tell two units of the same model apart, so the
 * unique-ish identifiers get precedence over prose.
 */
function deviceIdentifier(d) {
  for (const key of ['serial', 'uuid', 'version', 'rom', 'edcType']) {
    const v = d[key];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function deviceTabsHTML() {
  // Counts come from the server so a filter or a selected tab cannot zero out the
  // other three tabs.
  const counts = state.deviceCounts || {};
  return `<div class="segmented dev-tabs" role="tablist" aria-label="Device type">
    ${state.deviceKinds
      .map((k) => {
        const def = DEVICE_KIND[k] || { tone: 'slate', icon: 'layers', label: k };
        const on = state.deviceKind === k;
        return `<button type="button" class="seg dev-tab ${on ? 'on' : ''}" role="tab"
          aria-selected="${on}" data-device-kind="${k}">
          ${icon[def.icon] ? icon[def.icon](14) : ''}<span>${h(def.label)}</span>
          <em class="dev-count">${counts[k] || 0}</em>
        </button>`;
      })
      .join('')}
  </div>`;
}

/**
 * The device table.
 *
 * Columns come from the KIND's field list (`state.deviceFields`), not from a
 * fixed template — that is what lets an EDC sheet show nine columns while Misc
 * shows three, from one renderer. Notes gets a narrower column and wraps, since
 * it is the only field that holds sentences.
 */
/** The visible columns for the current kind, in configured order. */
function deviceColumns() {
  const cols = state.deviceColumns?.[state.deviceKind];
  if (Array.isArray(cols) && cols.length) return cols.filter((c) => !c.hidden);
  // Fall back to the prescribed fields if the config has not loaded yet, so the
  // table is never blank on a slow first paint.
  return (state.deviceFields[state.deviceKind] || []).map((key) => ({
    key,
    label: state.deviceLabels[key] || key,
    builtin: true,
  }));
}

/** One cell's value, whether the column is a real field or a user-added one. */
function deviceCellValue(d, col) {
  if (col.builtin) return d[col.key] ?? '';
  const v = d.extra?.[col.key];
  return v === undefined || v === null ? '' : String(v);
}

function devicesTableHTML(rows) {
  const cols = deviceColumns();
  const editing = !!state.deviceEdit;
  // Rows in the grid = stored rows + rows added but not yet saved. The pending
  // ones carry a negative id so every per-cell selector keeps working unchanged.
  const pending = editing ? state.deviceEdit.pending || [] : [];
  const gridRows = editing ? [...rows, ...pending.map((r) => ({ id: r.tmp, __pending: true }))] : rows;
  if (!rows.length) {
    const q = state.deviceQuery.trim();
    return `<div class="empty">
      <div class="icon">${icon.phone(26)}</div>
      <h3>${q ? `No devices match “${h(q)}”` : `No ${h(DEVICE_KIND[state.deviceKind]?.label || state.deviceKind)} devices yet`}</h3>
      <p>${q ? `It looks in every column of the ${h(DEVICE_KIND[state.deviceKind]?.label || state.deviceKind)} tab — try another type, or search from All.` : 'Add the first one so the team knows what kit is available.'}</p>
      ${q ? '' : `<button class="btn btn-primary" data-device-new>${icon.plus()} Add device</button>`}
    </div>`;
  }
  return `<div class="dev-tablewrap${editing ? ' is-bulk' : ''}" data-dev-scroll>
      <span class="dev-scrollfx left" aria-hidden="true"></span>
      <span class="dev-scrollfx right" aria-hidden="true"></span>
    <table class="dev-table">
      <thead><tr>
        ${editing ? '<th class="dev-h-grip"><span class="sr-only">Reorder</span></th>' : ''}
        ${cols
          .map(
            (c, ci) => `<th class="dev-h-${h(c.key)}" data-dev-colhead="${ci}" data-col-key="${h(c.key)}"
              draggable="${editing ? 'true' : 'false'}"${
                editing ? ` title="${h(c.label)} — drag to move this column"` : ''
              }>
              <span class="dev-h-inner">
                ${editing ? `<span class="dev-col-grip" aria-hidden="true">${icon.gripX(11)}</span>` : ''}
                <span class="dev-h-label">${h(c.label)}</span>
              </span>
            </th>`
          )
          .join('')}
        ${editing ? '<th class="dev-h-acts"><span class="sr-only">Actions</span></th>' : ''}
      </tr></thead>
      <tbody>${gridRows
        .map(
          (d, ri) => `<tr data-dev-row="${d.id}" data-ri="${ri}"${editing ? ' class="is-editing"' : ''}${d.__pending ? ' data-pending="1"' : ''}>
          ${
            editing
              ? `<td class="dev-grip"${d.__pending ? '' : ' draggable="true"'}
            title="${d.__pending ? 'Save this row before reordering it' : 'Drag to reorder'}"><span class="dev-grip-dots${d.__pending ? ' is-off' : ''}">${icon.grip(12)}</span></td>`
              : ''
          }
          ${cols
            .map((c) => {
              if (editing) {
                // Every visible cell becomes an input, so the whole sheet can be
                // corrected without opening a dialog per row. The column label is
                // repeated as the accessible name: the header is far above on a
                // wide sheet, so "input" alone would be unidentifiable.
                const v = d.__pending ? state.deviceEdit.draft[d.id]?.[c.key] ?? '' : bulkCellValue(d.id, c);
                // The label span is hidden on desktop (the header already names the
                // column) and shown when the row stacks into a card on a phone, where
                // the header is off-screen and each field needs its own name.
                const common = `class="input dev-cell-input" data-bulk-cell="${d.id}" data-bulk-col="${h(c.key)}"
                  aria-label="${h(d.name)} — ${h(c.label)}" placeholder="${h(c.label)}"`;
                // A free-text column gets a textarea: a single-line input can only show
                // the first ~40 characters of a note, and hiding the rest behind a
                // sideways scroll inside a one-line box makes it unreadable. Derived
                // from the column and the value rather than a per-column flag, so a
                // user-added column with long text is treated the same way.
                const longText = c.key === 'notes' || String(v).length > 40;
                const field = longText
                  ? `<textarea ${common} rows="${Math.min(6, Math.max(2, Math.ceil(String(v).length / 46)))}">${h(v)}</textarea>`
                  : `<input ${common} type="text" value="${h(v)}" autocomplete="off" />`;
                return `<td class="dev-edit-cell" data-label="${h(c.label)}">
                  <span class="de-label" aria-hidden="true">${h(c.label)}</span>${field}</td>`;
              }
              const v = deviceCellValue(d, c);
              if (!String(v).trim()) return `<td class="dev-empty-cell">—</td>`;
              if (c.key === 'name') return `<td class="dev-name">${h(v)}</td>`;
              if (c.key === 'notes') return `<td class="dev-notes" title="${h(v)}">${h(v)}</td>`;
              return `<td class="dev-mono-cell">${h(v)}</td>`;
            })
            .join('')}
          ${editing ? `<td class="dev-acts" data-label="Row actions"><span class="dev-acts-inner">
            ${d.__pending
              ? `<span class="dev-new-chip" title="This row is not saved yet">New</span>
                <button class="btn btn-icon btn-icon-danger" data-pending-drop="${d.id}"
                  aria-label="Remove this unsaved row" title="Remove this unsaved row">${icon.x(13)}</button>`
              : `<button class="btn btn-icon" data-device-edit="${d.id}"
                  aria-label="Edit ${h(d.name || 'device')}" title="Edit">${icon.edit(13)}</button>
                ${
                  canManageCatalog()
                    ? `<button class="btn btn-icon btn-icon-danger" data-device-del="${d.id}"
                        aria-label="Delete this row" title="Delete this row">${icon.trash(13)}</button>`
                    : ''
                }`}
          </span></td>` : ''}
        </tr>`
        )
        .join('')}
        ${
          editing
            ? `<tr class="dev-addrow"><td class="dev-grip dev-addrow-grip"></td>
          <td class="dev-addrow-cell" colspan="${cols.length + 1}">
            <button type="button" class="dev-addrow-btn is-add" data-bulk-addrow>${icon.plus(13)} Add a row</button>
          </td>
        </tr>`
            : ''
        }</tbody>
    </table>
  </div>
  <p class="dev-scrollhint">${icon.chevronRight(12)} Scroll sideways for the remaining columns</p>`;
}

/**
 * Current text for one cell in bulk-edit mode.
 *
 * Reads the draft, falling back to the saved value so a column the user has not
 * touched still shows what is stored — the draft is a diff, not a replacement.
 */
function bulkCellValue(deviceId, col) {
  const draft = state.deviceEdit?.draft?.[deviceId];
  if (draft && Object.prototype.hasOwnProperty.call(draft, col.key)) return draft[col.key];
  // A row added in the grid has no stored record yet, so its only value is what
  // is in the draft; falling through to the saved list would return ''.
  const pend = state.deviceEdit?.pending?.find((r) => r.tmp === Number(deviceId));
  if (pend) return pend.values[col.key] ?? '';
  const d = state.devices.find((x) => Number(x.id) === Number(deviceId));
  return d ? deviceCellValue(d, col) : '';
}

/** A row that exists only in the grid so far. Ids are negative and never persisted. */
function isPendingRow(deviceId) {
  return Number(deviceId) < 0;
}

/**
 * Enter grid edit for the rows currently on screen.
 *
 * Only visible rows are edited: starting from what the user can see means Save
 * never silently rewrites something that was filtered out of view.
 */
function startBulkEdit() {
  const rows = state.devices || [];
  if (!rows.length) return;
  state.deviceEdit = { ids: rows.map((d) => d.id), draft: {}, pending: [], nextTmp: -1 };
  mountContent();
  // Put the caret in the first cell: the whole point is to start typing, and
  // making the user hunt for the first input wastes the gesture.
  const first = document.querySelector('.dev-cell-input');
  first?.focus();
  first?.select?.();
}

/**
 * Add an empty row to the grid.
 *
 * The row is created on Save, not now: writing a blank device to the database the
 * moment someone clicks "+" would leave junk rows behind if they change their
 * mind, and the grid is supposed to be a draft until Save.
 */
function addPendingRow() {
  if (!state.deviceEdit) return;
  const tmp = state.deviceEdit.nextTmp ?? -1;
  state.deviceEdit.nextTmp = tmp - 1;
  state.deviceEdit.pending = [...(state.deviceEdit.pending || []), { tmp, values: {} }];
  repaintDeviceRows();
  const sel = `[data-bulk-cell="${tmp}"][data-bulk-col="name"]`;
  const input = document.querySelector(sel);
  input?.scrollIntoView({ block: 'center' });
  input?.focus();
  refreshBulkCounter();
}

function removePendingRow(tmp) {
  if (!state.deviceEdit) return;
  state.deviceEdit.pending = (state.deviceEdit.pending || []).filter((r) => r.tmp !== Number(tmp));
  delete state.deviceEdit.draft[Number(tmp)];
  repaintDeviceRows();
  refreshBulkCounter();
}

function cancelBulkEdit() {
  state.deviceEdit = null;
  mountContent();
}

/**
 * Keep the draft in step with what is typed, and save on Enter.
 *
 * The draft exists so a re-render mid-edit (a repaint after deleting a row, say)
 * does not silently throw away typed values. It records only fields the user
 * actually touched, which is also why the dirty counter reads the live inputs
 * instead.
 */
/**
 * Grow a note textarea to fit its content.
 *
 * A fixed `rows` count is a guess: the same 50 characters take two lines at
 * desktop width and three on a phone, so the box either clips the value or
 * leaves a hole. Measuring the scroll height is the only way to know.
 */
function autosizeNote(el) {
  if (el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  // +2px absorbs the sub-pixel rounding that otherwise leaves a 1-2px scrollbar
  // and makes the last line look clipped.
  el.style.height = `${el.scrollHeight + 2}px`;
}

function bindBulkCells() {
  if (!state.deviceEdit) return;
  const inputs = document.querySelectorAll('[data-bulk-cell]');
  inputs.forEach((input, i) => {
    autosizeNote(input);
    if (input.dataset.bound) return;
    input.dataset.bound = '1';
    const write = () => {
      const id = Number(input.dataset.bulkCell);
      const cells = (state.deviceEdit.draft[id] ||= {});
      cells[input.dataset.bulkCol] = input.value;
      refreshBulkCounter();
    };
    input.addEventListener('input', () => {
      autosizeNote(input);
      write();
    });
    // Enter is the fastest way through a column of corrections, so it saves the
    // whole batch rather than just committing one cell. Shift+Enter and Tab keep
    // their normal meaning for moving around the grid.
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        // In a note field Enter is a newline, not "save everything": a multi-line
        // note is written with the key, so saving on it would make the field
        // impossible to use.
        if (input.tagName === 'TEXTAREA') return;
        ev.preventDefault();
        document.querySelector('[data-bulk-save]')?.click();
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        document.querySelector('[data-bulk-cancel]')?.click();
      }
      // Tab past the last cell would leave the grid and lose the caret; wrap
      // instead so the user keeps circling the sheet.
      if (ev.key === 'Tab' && !ev.shiftKey && i === inputs.length - 1) {
        ev.preventDefault();
        inputs[0].focus();
        inputs[0].select();
      }
      if (ev.key === 'Tab' && ev.shiftKey && i === 0) {
        ev.preventDefault();
        inputs[inputs.length - 1].focus();
        inputs[inputs.length - 1].select();
      }
    });
  });
}

async function saveBulkEdit(btn) {
  if (!state.deviceEdit) return;
  const rows = state.devices;
  const pending = state.deviceEdit.pending || [];
  // Send only what changed. A whole-sheet write would stamp updated_at on rows
  // nobody touched and could clobber a concurrent edit from another session.
  const updates = [];
  for (const d of rows) {
    const payload = { id: d.id };
    const extra = { ...(d.extra || {}) };
    let touched = false;
    for (const c of deviceColumns()) {
      const input = document.querySelector(`[data-bulk-cell="${d.id}"][data-bulk-col="${c.key}"]`);
      if (!input) continue;
      // Compare against the stored value with the RIGHT accessor: custom columns
      // live in `extra`, and reading them off the row directly always looked empty,
      // so every custom cell counted as edited on every save.
      const stored = c.builtin ? d[c.key] : d.extra?.[c.key];
      if (String(input.value) === String(stored ?? '')) continue;
      // Same split the single-row form uses: a custom key sent at the top level is
      // silently dropped by the server, which only persists known field names.
      if (c.builtin) payload[c.key] = input.value;
      else extra[c.key] = input.value;
      touched = true;
    }
    if (touched) {
      payload.extra = extra;
      updates.push(payload);
    }
  }
  // Rows added in the grid are inserts, not edits: they are collected separately
  // and written after the updates so a failure part-way cannot lose them silently.
  const creates = pending.map((r) => {
    const values = { kind: state.deviceKind, extra: {} };
    for (const c of deviceColumns()) {
      const input = document.querySelector(`[data-bulk-cell="${r.tmp}"][data-bulk-col="${c.key}"]`);
      const v = input ? input.value : r.values[c.key] || '';
      if (c.builtin) values[c.key] = v;
      else values.extra[c.key] = v;
    }
    return values;
  });
  if (!updates.length && !creates.length) {
    toast('Nothing changed', 'info');
    cancelBulkEdit();
    return;
  }
  // Blank names are the one thing the grid can produce that the API rejects, so
  // catch it here where the offending row can be pointed at.
  const blank = [...rows, ...pending.map((r) => ({ id: r.tmp }))].find((d) => {
    const input = document.querySelector(`[data-bulk-cell="${d.id}"][data-bulk-col="name"]`);
    return input && !input.value.trim();
  });
  if (blank) {
    toast('Every device needs a name — check the highlighted row', 'err');
    const input = document.querySelector(`input[data-bulk-cell="${blank.id}"][data-bulk-col="name"]`);
    input?.classList.add('is-bad');
    input?.focus();
    return;
  }
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Saving…';
  try {
    if (updates.length) await api.bulkUpdateDevices(updates);
    for (const payload of creates) await api.createDevice(payload);
    const total = updates.length + creates.length;
    toast(`Saved ${total} row${total === 1 ? '' : 's'}`, 'ok');
    state.deviceEdit = null;
    await loadDevices();
    await loadStats();
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false;
    btn.textContent = label;
  }
}

/** Card view for narrow screens: a table with nine columns cannot fit a phone. */
function devicesCardsHTML(rows) {
  const cols = deviceColumns();
  const editing = !!state.deviceEdit;
  if (!rows.length) return devicesTableHTML(rows);
  return `<div class="dev-cards">${rows
    .map((d) => {
      const ident = deviceIdentifier(d);
      const notesCol = cols.find((c) => c.key === 'notes');
      const notes = notesCol ? deviceCellValue(d, notesCol) : '';
      return `<article class="dev-card">
        <header class="dc-head">
          <div>
            <h4>${h(d.name)}</h4>
            ${ident ? `<p class="dc-ident">${h(ident)}</p>` : ''}
          </div>
          <div class="dc-acts">
            ${editing ? `<button class="btn btn-icon" data-device-edit="${d.id}" aria-label="Edit ${h(d.name)}">${icon.edit(13)}</button>
            ${canManageCatalog() ? `<button class="btn btn-icon btn-icon-danger" data-device-del="${d.id}" aria-label="Delete ${h(d.name)}">${icon.trash(13)}</button>` : ''}` : ''}
          </div>
        </header>
        <dl class="dc-fields">
          ${cols
            .filter((c) => c.key !== 'name' && c.key !== 'notes')
            .map((c) => `<div class="dc-row"><dt>${h(c.label)}</dt><dd>${h(deviceCellValue(d, c) || '—')}</dd></div>`)
            .join('')}
        </dl>
        ${notes ? `<p class="dc-notes">${h(notes)}</p>` : ''}
      </article>`;
    })
    .join('')}</div>`;
}

function devicesHTML() {
  const rows = state.devices || [];
  const def = DEVICE_KIND[state.deviceKind] || { label: state.deviceKind };
  const editing = !!state.deviceEdit;
  return `<div class="dev-head">
      <div>
        <h2>${h(def.label)} devices</h2>
        <p class="dev-sub">${rows.length} device${rows.length === 1 ? '' : 's'} in this type</p>
      </div>
      <div class="dev-head-actions">
        <button class="btn" data-device-import>${icon.upload(13)} Import</button>
        ${
          editing
            ? ''
            : rows.length
              ? `<button class="btn" data-device-bulk>${icon.edit(14)} Edit all rows</button>`
              : /* No rows means no edit mode to enter, so this is the only way to
                   create the first device — keep the CTA rather than dead-ending. */
                `<button class="btn btn-primary" data-device-new>${icon.plus()} Add device</button>`
        }
      </div>
    </div>
    ${editing ? bulkBarHTML(rows) : ''}
    <div class="dev-bar">
      ${deviceTabsHTML()}
      <div class="search dev-search">
        ${icon.search()}
        <input class="input" id="device-search" placeholder="Search any column…"
          autocomplete="off" aria-label="Search devices" value="${h(state.deviceQuery || '')}"
          ${editing ? 'disabled' : ''} />
        <button class="btn btn-sm dev-clear" data-device-clear ${state.deviceQuery ? '' : 'hidden'}>Clear</button>
      </div>
    </div>
    ${state.devicesLoading ? `<div class="dev-skel"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>` : ''}
    <div class="${state.devicesLoading ? 'is-hidden' : ''}">
      ${editing ? `<div class="dev-bulkhost">${devicesTableHTML(rows)}</div>` : `<div class="dev-desktop">${devicesTableHTML(rows)}</div>
      <div class="dev-mobile">${devicesCardsHTML(rows)}</div>`}
    </div>`;
}

/**
 * Save / discard strip shown above the sheet while every row is editable.
 *
 * It states the scope explicitly (`all N rows on this tab`) because the edit
 * covers what is on screen, not the whole database — a user who filtered or
 * paged the sheet should not assume Save reaches rows they cannot see.
 */
function bulkBarHTML(rows) {
  const dirty = bulkDirtyCount();
  // "Add column" sits immediately LEFT of "Add device": both are "one more of a thing",
  // and grouping the two add-actions here keeps the trailing table row to the single
  // row-level action it is named after. The bar is where a user looks for a toolbar.
  // The keyboard hint is hidden on phones by CSS — a phone has no Tab key.
  return `<div class="dev-bulkbar">
    <span class="db-tag">${icon.edit(13)} Editing ${rows.length} row${rows.length === 1 ? '' : 's'}</span>
    <span class="db-note">Every cell is open. Tab moves across, Enter saves.</span>
    <span class="spacer"></span>
    <span class="db-dirty" data-bulk-dirty>${dirty ? `${dirty} changed` : 'No changes yet'}</span>
    <button class="btn" data-device-addcol>${icon.colPlus(13)} Add column</button>
    <button class="btn" data-device-new>${icon.plus(13)} Add device</button>
    <button class="btn" data-bulk-cancel>Discard</button>
    <button class="btn btn-primary" data-bulk-save>Save all${dirty ? ` (${dirty})` : ''}</button>
  </div>`;
}

/** How many cells differ from what is stored — drives the counter and Save label. */
/** Repaint the counter and the Save label from the current inputs. */
function refreshBulkCounter() {
  const badge = document.querySelector('[data-bulk-dirty]');
  const save = document.querySelector('[data-bulk-save]');
  const n = bulkDirtyCount();
  if (badge) badge.textContent = n ? `${n} changed` : 'No changes yet';
  if (save) save.textContent = n ? `Save all (${n})` : 'Save all';
}

function bulkDirtyCount() {
  if (!state.deviceEdit) return 0;
  let n = 0;
  // Count against the live inputs rather than the draft: the draft only records
  // fields the user typed in, so it cannot tell whether a value actually
  // changed — retyping the same text would look like an edit.
  for (const input of document.querySelectorAll('[data-bulk-cell]')) {
    const id = Number(input.dataset.bulkCell);
    const colConf = deviceColumns().find((c) => c.key === input.dataset.bulkCol);
    if (!colConf) continue;
    if (isPendingRow(id)) {
      // An added row counts once, when its first field is filled in — counting all
      // six blank cells would report "6 changed" for one new row the instant it
      // appeared, which reads as six accidental edits.
      if (String(input.value).trim()) n += 1;
      continue;
    }
    const row = state.devices.find((x) => Number(x.id) === id);
    if (!row) continue;
    if (String(input.value) !== String(deviceCellValue(row, colConf))) n += 1;
  }
  return n;
}

async function loadDevices() {
  state.devicesLoading = !state.devices.length;
  if (state.devicesLoading) mountContent();
  const token = nextLoadToken('devices');
  try {
    const res = await api.devices({ kind: state.deviceKind, q: state.deviceQuery.trim() });
    if (!isCurrentLoad('devices', token)) return;
    state.devices = res.devices;
    state.deviceCounts = res.counts || {};
    state.deviceColumns = res.columns || {};
    state.deviceFields = res.fields;
    state.deviceLabels = res.labels;
    state.deviceKinds = res.kinds;
  } catch (err) {
    if (!isCurrentLoad('devices', token)) return;
    toast(err.message, 'err');
    state.devices = [];
  }
  state.devicesLoading = false;
  if (state.nav === 'devices') mountContent();
}

/**
 * Add / edit one device.
 *
 * The form is built from the kind's own field list, so switching the type
 * re-renders the fields in place. Values typed under the OLD type are kept in a
 * scratch object and restored if the user switches back — losing half a form to a
 * mis-click on the type control would be its own bug report.
 */
function openDeviceForm(device = null) {
  const isEdit = !!device;
  let kind = device?.kind || state.deviceKind;
  // ONE value store for the whole form, keyed by field name. Fields shared by
  // several kinds (name, whoUsed, notes) therefore survive a type switch — a user
  // who mis-files a device and flips Android -> EDC should not have to retype the
  // name. Fields the new kind does not own simply stay in the store unused, and
  // are dropped before saving.
  const values = { ...(isEdit ? device : {}) };

  // Columns drive the form, not the prescribed field list: a user who added
  // "Firmware Build" must be able to fill it in, and a column they hid should
  // not keep asking for a value nothing displays.
  const formColumns = (k) => {
    const cols = state.deviceColumns?.[k];
    if (Array.isArray(cols) && cols.length) return cols.filter((c) => !c.hidden);
    const labels = state.deviceLabels || {};
    return (state.deviceFields[k] || []).map((f) => ({ key: f, label: labels[f] || f, builtin: true }));
  };
  const fieldListHTML = (k) => {
    const cols = formColumns(k);
    return cols
      .map((col) => {
        const f = col.key;
        const v = col.builtin ? values[f] ?? '' : values.extra?.[f] ?? '';
        const label = col.label || f;
        if (f === 'notes') {
          return `<div class="field dev-field-wide">
            <label for="d-notes">${h(label)}</label>
            <textarea class="textarea" id="d-notes" rows="3"
              placeholder="Anything worth remembering…">${h(v)}</textarea>
          </div>`;
        }
        return `<div class="field">
          <label for="d-${f}">${h(label)}${f === 'name' ? ' <em class="req">*</em>' : ''}</label>
          <input class="input" id="d-${f}" value="${h(v)}"
            placeholder="${h(f === 'name' ? 'e.g. Samsung Galaxy A54' : label)}" />
        </div>`;
      })
      .join('');
  };

  const bodyHTML = (k) => `<div class="field">
      <label>Type</label>
      <div class="segmented" data-segmented="devkind" role="group" aria-label="Device type">
        ${state.deviceKinds
          .map(
            (x) => `<button type="button" class="seg ${x === k ? 'on' : ''}" data-value="${h(x)}">${
              icon[DEVICE_KIND[x]?.icon] ? icon[DEVICE_KIND[x].icon](13) : ''
            } ${h(DEVICE_KIND[x]?.label || x)}</button>`
          )
          .join('')}
      </div>
      <span class="hint">Each type records its own fields — switching type swaps them.</span>
    </div>
    <div class="dev-fields" id="d-fields">${fieldListHTML(k)}</div>`;

  const { close, modal } = openModal({
    title: isEdit ? 'Edit device' : 'Add device',
    subtitle: isEdit ? device.name : 'Record one phone, terminal or piece of kit',
    wide: true,
    body: bodyHTML(kind),
    footer: `<button class="btn" data-cancel>Cancel</button>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-save>${isEdit ? 'Save changes' : 'Add device'}</button>`,
    onMount: (m) => {
      const seg = m.querySelector('[data-segmented="devkind"]');
      // bindSegmented(root, name, onChange): it looks the group up by name inside
      // root, so passing the group itself as root finds nothing.
      bindSegmented(m, 'devkind', () => {
        // Harvest what is on screen BEFORE swapping the field list, then reuse it
        // for the new kind so shared fields keep their text.
        for (const col of formColumns(kind)) {
          const el = m.querySelector(`#d-${col.key}`);
          if (!el) continue;
          if (col.builtin) values[col.key] = el.value;
          else values.extra = { ...(values.extra || {}), [col.key]: el.value };
        }
        kind = seg.querySelector('button.on')?.dataset.value || kind;
        m.querySelector('#d-fields').innerHTML = fieldListHTML(kind);
      });
      m.querySelector('#d-name')?.focus();
    },
  });

  modal.querySelector('[data-cancel]')?.addEventListener('click', close);
  modal.querySelector('[data-save]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const payload = { kind };
    const extra = {};
    for (const col of formColumns(kind)) {
      const el = modal.querySelector(`#d-${col.key}`);
      const v = el ? el.value : '';
      // Built-in columns are real DB columns; custom ones ride in the `extra`
      // blob. Sending a custom key at the top level would be silently dropped
      // by the server, which only persists known field names.
      if (col.builtin) payload[col.key] = v;
      else extra[col.key] = v;
    }
    payload.extra = extra;
    if (!String(payload.name || '').trim()) {
      toast('Device name is required', 'err');
      modal.querySelector('#d-name')?.focus();
      return;
    }
    btn.disabled = true;
    try {
      if (isEdit) await api.updateDevice(device.id, payload);
      else await api.createDevice(payload);
      // Follow the saved kind so the row is visible rather than orphaned in a
      // tab the user is not looking at.
      state.deviceKind = kind;
      localStorage.setItem('opm-device-kind', kind);
      state.deviceQuery = '';
      close();
      toast(isEdit ? 'Device updated' : 'Device added', 'ok');
      await loadDevices();
      await loadStats();
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });
}

/**
 * Column editor for the current kind — the equivalent of the Information
 * center's grid editor, scoped to what an inventory sheet actually needs:
 * rename, reorder, hide, add and delete, then save the whole arrangement.
 *
 * Edits are held in a local `draft` and only written when Save is pressed, so an
 * abandoned edit cannot half-apply a column change.
 */
function openColumnEditor(options = {}) {
  const kind = state.deviceKind;
  const all = (state.deviceColumns?.[kind] || []).map((c) => ({ ...c }));
  const draft = all.map((c) => ({ ...c }));
  let seq = draft.length;

  const listHTML = () => `<ul class="dc-list">
    ${draft
      .map(
        (c, i) => `<li class="dc-item" data-key="${h(c.key)}">
        <span class="dc-item-grip" aria-hidden="true">${icon.grip(12)}</span>
        <input class="input dc-label" value="${h(c.label)}" aria-label="Column name" maxlength="60" />
        <span class="dc-item-key">${c.builtin ? 'field' : 'custom'}</span>
        <label class="dc-hide" title="Hide this column">
          <input type="checkbox" data-hide ${c.hidden ? 'checked' : ''} />
          <span>hidden</span>
        </label>
        <span class="dc-item-move">
          <button type="button" class="te-mini" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move left">${icon.chevronLeft(15)}</button>
          <button type="button" class="te-mini" data-move="1" ${i === draft.length - 1 ? 'disabled' : ''} aria-label="Move right">${icon.chevronRight(15)}</button>
        </span>
        <button type="button" class="te-mini te-mini-danger" data-del aria-label="Delete column"
          ${draft.length <= 1 ? 'disabled' : ''}>${icon.trash(15)}</button>
      </li>`
      )
      .join('')}
  </ul>`;

  const { close, modal } = openModal({
    title: `Columns — ${DEVICE_KIND[kind]?.label || kind}`,
    subtitle: 'Rename, reorder, hide, add or remove. Only this type is affected.',
    wide: true,
    // openModal focuses its own first input on the next frame, which would land on
    // the first column's rename box. Passing initialFocus is the only way to win
    // that race — a focus() call in onMount is overwritten.
    initialFocus: options.addNew ? '#dc-new' : '',
    body: `<div class="dc-editor">
        <p class="dc-help">Drag a row, or use the arrows, to change column order.
          <strong>Field</strong> columns are built in for this device type;
          <strong>custom</strong> columns are yours, and can be deleted.</p>
        <div id="dc-list-host" class="dc-list-wrap">${listHTML()}</div>
        <button type="button" class="dc-more" data-more hidden>Show more columns</button>
        <div class="dc-add">
          <input class="input" id="dc-new" placeholder="New column name, e.g. IMEI" maxlength="60" />
          <button type="button" class="btn btn-sm" data-add>${icon.colPlus(13)} Add column</button>
        </div>
      </div>`,
    footer: `<button class="btn" data-cancel>Cancel</button>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-save>Save columns</button>`,
    onMount: (m) => {
      const host = m.querySelector('#dc-list-host');

      // Harvest input values before any repaint, or typing is lost on move.
      const harvest = () => {
        host.querySelectorAll('.dc-item').forEach((li, i) => {
          const input = li.querySelector('.dc-label');
          if (draft[i]) draft[i].label = input.value;
        });
      };
      // Cap the list at whole rows. The pitch depends on the item's rendered
      // height (which changes on narrow screens where a row wraps), so it is
      // measured rather than hard-coded — a CSS-only max-height sliced the next
      // row in half at the scroll edge, which reads as a rendering bug.
      // Whether the list overflows decides whether the edge fade is shown. The
      // height itself is left to CSS: an earlier version computed whole-row caps in
      // JS, but the row pitch is only correct after the buttons and inputs have
      // their final size, so the cap landed between rows anyway. A partially visible
      // row BEHIND a fade is the standard "there is more" cue; a partially visible
      // row with no fade and no visible scrollbar just looks cropped.
      // A fade alone did not register as a cue — it is too subtle at normal viewing
      // size, and the browser's scrollbar is an overlay that draws nothing until you
      // scroll. So the editor states it in words: when the list overflows, a "Show
      // more columns" button appears under it and scrolls the next row into view.
      const fitRows = () => {
        const list = host.querySelector('.dc-list');
        if (!list) return;
        const over = list.scrollHeight > list.clientHeight + 1;
        list.classList.toggle('is-scrollable', over);
        const more = m.querySelector('[data-more]');
        if (!more) return;
        const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
        more.hidden = !over || atEnd;
        if (!more.hidden) {
          const left = Math.max(0, list.scrollHeight - list.clientHeight - list.scrollTop);
          more.textContent = `Show more columns (${Math.ceil(left / 47)} more)`;
        }
      };
      m.querySelector('[data-more]')?.addEventListener('click', () => {
        host.querySelector('.dc-list')?.scrollBy({ top: 300, behavior: 'smooth' });
      });
      // Re-evaluate on scroll, otherwise the button still offers "more" after the
      // user has reached the end — the one state where an affordance must not lie.
      // Bound on the HOST in the capture phase, not on the list: every add/move/delete
      // rebuilds the list's DOM, so a listener on the node dies with the first edit and
      // the button silently stops tracking the scroll position.
      host.addEventListener('scroll', () => fitRows(), { passive: true, capture: true });
      const repaint = () => {
        host.innerHTML = listHTML();
        fitRows();
      };

      host.addEventListener('input', (ev) => {
        const li = ev.target.closest('.dc-item');
        if (!li) return;
        const i = [...host.querySelectorAll('.dc-item')].indexOf(li);
        if (ev.target.matches('[data-hide]')) draft[i].hidden = ev.target.checked;
        else if (ev.target.matches('.dc-label')) draft[i].label = ev.target.value;
      });

      host.addEventListener('click', (ev) => {
        const li = ev.target.closest('.dc-item');
        if (!li) return;
        const i = [...host.querySelectorAll('.dc-item')].indexOf(li);
        const move = ev.target.closest('[data-move]');
        if (move) {
          harvest();
          const to = i + Number(move.dataset.move);
          if (to < 0 || to >= draft.length) return;
          const [item] = draft.splice(i, 1);
          draft.splice(to, 0, item);
          repaint();
          return;
        }
        if (ev.target.closest('[data-del]')) {
          harvest();
          if (draft.length <= 1) return;
          draft.splice(i, 1);
          repaint();
        }
      });

      // Drag to reorder inside the editor.
      let from = -1;
      host.addEventListener('dragstart', (ev) => {
        const li = ev.target.closest('.dc-item');
        if (!li) return;
        from = [...host.querySelectorAll('.dc-item')].indexOf(li);
        li.classList.add('is-dragging');
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', String(from));
        }
      });
      host.addEventListener('dragover', (ev) => {
        const li = ev.target.closest('.dc-item');
        if (!li || from < 0) return;
        ev.preventDefault();
        host.querySelectorAll('.is-drop-before, .is-drop-after').forEach((el) =>
          el.classList.remove('is-drop-before', 'is-drop-after')
        );
        const rect = li.getBoundingClientRect();
        li.classList.add(ev.clientY > rect.top + rect.height / 2 ? 'is-drop-after' : 'is-drop-before');
      });
      host.addEventListener('drop', (ev) => {
        const li = ev.target.closest('.dc-item');
        if (!li || from < 0) return;
        ev.preventDefault();
        harvest();
        const target = [...host.querySelectorAll('.dc-item')].indexOf(li);
        const rect = li.getBoundingClientRect();
        const after = ev.clientY > rect.top + rect.height / 2;
        // Two steps: the insertion slot in the ORIGINAL list, then shift it down
        // when the dragged item sat to its left and has already been lifted out.
        const slot = after ? target + 1 : target;
        const to = slot > from ? slot - 1 : slot;
        const src = from;
        from = -1;
        if (to === src) {
          repaint();
          return;
        }
        const [item] = draft.splice(src, 1);
        draft.splice(to, 0, item);
        repaint();
      });
      host.addEventListener('dragend', () => {
        from = -1;
        host.querySelectorAll('.is-dragging, .is-drop-before, .is-drop-after').forEach((el) =>
          el.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after')
        );
      });

      m.querySelector('[data-add]').addEventListener('click', () => {
        const input = m.querySelector('#dc-new');
        const label = input.value.trim();
        if (!label) {
          toast('Give the column a name', 'err');
          input.focus();
          return;
        }
        harvest();
        // A key is derived from the label and made unique; it is what the values
        // are stored under, so it must never collide with an existing one.
        const base =
          label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 32) || 'col';
        let key = base;
        let n = 2;
        while (draft.some((c) => c.key === key)) key = `${base}_${n++}`;
        draft.push({ key, label, hidden: false, builtin: false });
        input.value = '';
        repaint();
        input.focus();
        // A new column lands at the end of the list, which is usually below the fold —
        // the user pressed "Add column" and saw nothing appear. Scroll it into view.
        requestAnimationFrame(() => {
          const list = host.querySelector('.dc-list');
          if (list) list.scrollTop = list.scrollHeight;
          fitRows();
        });
      });
      m.querySelector('#dc-new').addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          m.querySelector('[data-add]').click();
        }
      });
      fitRows();
      window.addEventListener('resize', fitRows);
      if (options.addNew) {
        // Bring the new-column row into view so the focused field is not off screen.
        requestAnimationFrame(() => {
          const list = host.querySelector('.dc-list');
          if (list) list.scrollTop = list.scrollHeight;
        });
      }
    },
  });

  modal.querySelector('[data-cancel]')?.addEventListener('click', close);
  modal.querySelector('[data-save]')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const items = [...modal.querySelectorAll('.dc-item')];
    const payload = items.map((li, i) => ({
      key: li.dataset.key,
      label: (li.querySelector('.dc-label')?.value || '').trim() || draft[i]?.label || 'Column',
      hidden: !!li.querySelector('[data-hide]')?.checked,
      builtin: draft.find((c) => c.key === li.dataset.key)?.builtin ?? false,
    }));
    if (payload.some((c, i) => !c.label || draft[i] === undefined)) {
      // Defensive: a repaint between harvest and read would leave a gap.
      toast('One column has no name', 'err');
      return;
    }
    btn.disabled = true;
    try {
      const res = await api.saveDeviceColumns(kind, payload);
      state.deviceColumns = { ...state.deviceColumns, [kind]: res.columns };
      close();
      toast('Columns saved', 'ok');
      await loadDevices();
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });
}

function bindDevices() {
  // Import lives in the page head, which `mountContent` re-creates on every repaint,
  // so the listener is bound here with the rest of the page's controls.
  document.querySelectorAll('[data-device-import]').forEach((b) =>
    b.addEventListener('click', () => openDeviceImport())
  );
  document.querySelectorAll('[data-device-kind]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (state.deviceKind === b.dataset.deviceKind) return;
      state.deviceKind = b.dataset.deviceKind;
      localStorage.setItem('opm-device-kind', state.deviceKind);
      state.devices = [];
      await loadDevices();
    })
  );
  // The trailing sheet row carries both "Add a row" and "Add a column": they are the
  // same kind of action (one more of the thing you are looking at), so they sit
  // together at the end of the grid. Both are bound in bindDeviceRows() because that
  // row is re-created by every repaint.
  // The toolbar, the empty state and the trailing "+ Add device" row all carry this
  // attribute, and bindDeviceRows() binds it after every repaint. Guarding on a flag
  // keeps a single listener per node — two listeners opened the form twice, which
  // looked like a duplicate form and doubled every field in the DOM.
  document.querySelectorAll('[data-device-new]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => openDeviceForm());
  });
  document.querySelectorAll('[data-device-cols]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => openColumnEditor());
  });
  // Edit/delete live in bindDeviceRows(): the search box re-renders only the
  // table body, so those handlers have to be re-attachable without a full page
  // render.
  const clear = document.querySelector('[data-device-clear]');
  if (clear) {
    clear.addEventListener('click', async () => {
      state.deviceQuery = '';
      await loadDevices();
      document.getElementById('device-search')?.focus();
    });
  }
  const search = document.getElementById('device-search');
  if (search) {
    let t;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        state.deviceQuery = search.value;
        // Keep the caret where it is: re-rendering the whole page on each
        // keystroke would blur the field mid-word.
        const rows = await api
          .devices({ kind: state.deviceKind, q: state.deviceQuery.trim() })
          .catch(() => null);
        if (!rows) return;
        state.devices = rows.devices;
        repaintDeviceRows();
        // The toolbar is NOT re-rendered (that would blur the field being typed
        // in), so its Clear button has to be toggled here by hand.
        const cb = document.querySelector('[data-device-clear]');
        if (cb) cb.hidden = !state.deviceQuery;
        bindDeviceRows();
        // The empty state owns its own "Add device" button, so it needs wiring
        // too when a search empties the table.
        document.querySelectorAll('[data-device-new]').forEach((b) => {
          if (b.dataset.bound) return;
          b.dataset.bound = '1';
          b.addEventListener('click', () => openDeviceForm());
        });
      }, 200);
    });
  }
  bindDeviceRows();
}

/** Row-level handlers, re-bound after every partial re-render. */
/**
 * Reveal the scroll affordances only when a table genuinely overflows, and drop the
 * left shadow once the user is back at the start. Runs after every render and on
 * resize, because whether it fits depends on the pane width.
 *
 * Takes the wrapper rather than querying one, because there are two tables in this
 * app and they must fade, hint and shadow identically: the inventory's `.dev-table`
 * and the Information center's sheet, which is the same table.
 */
function syncTableOverflow(wrap) {
  if (!wrap) return;
  const slack = wrap.scrollWidth - wrap.clientWidth;
  const overflow = slack > 1;
  wrap.classList.toggle('can-right', overflow && wrap.scrollLeft < slack - 1);
  wrap.classList.toggle('can-left', overflow && wrap.scrollLeft > 1);
  if (!wrap.dataset.scrollBound) {
    wrap.dataset.scrollBound = '1';
    wrap.addEventListener('scroll', () => syncTableOverflow(wrap), { passive: true });
  }
}

function syncDeviceOverflow() {
  syncTableOverflow(document.querySelector('[data-dev-scroll]'));
}

/** The Information center's copy of that call. Same function, different wrapper.
 *
 * Scoped to the fixed Table block: a note card renders the same `.dev-tablewrap`, so
 * a bare `[data-sheet-scroll]` query would sometimes measure a card instead — and a
 * card has no hint of its own to reveal. */
function syncSheetOverflow() {
  syncTableOverflow(document.querySelector('[data-doc-body="table"] [data-sheet-scroll]'));
}

if (!window.__devResizeBound) {
  window.__devResizeBound = true;
  window.addEventListener('resize', () => {
    if (state.nav === 'devices') syncDeviceOverflow();
    if (state.nav === 'info') syncSheetOverflow();
  });
}

/**
 * Drag a row to reorder the inventory.
 *
 * The grip cell is the drag handle and the only draggable element, so a drag
 * never starts from a text field or a button. Order is persisted immediately on
 * drop rather than behind a Save button: dragging IS the commit, and a silent
 * unsaved state would be lost on the next reload.
 */
/**
 * Drag a column header to move that column.
 *
 * Bound on `thead` and stopped there: the row-drag handler is bound on the whole
 * table and calls preventDefault() on any dragstart that is not a row grip, so a
 * column drag has to be intercepted above it or it would be cancelled before it
 * began.
 *
 * Only VISIBLE columns can be dragged. A hidden column still occupies a slot in the
 * saved config, so after the drop the full config is rebuilt by walking it and
 * substituting the new visible order into the non-hidden positions — that way a
 * hidden column keeps its place instead of being shuffled to the end whenever its
 * neighbours move.
 */
function bindDeviceColumnDrag() {
  const table = document.querySelector('.dev-table');
  if (!table || table.dataset.colDragBound) return;
  table.dataset.colDragBound = '1';
  const head = table.querySelector('thead');
  if (!head) return;

  let fromIdx = null;
  const clearColMarks = () => {
    head
      .querySelectorAll('.is-col-dragging, .is-col-drop-before, .is-col-drop-after')
      .forEach((el) => el.classList.remove('is-col-dragging', 'is-col-drop-before', 'is-col-drop-after'));
  };

  head.addEventListener('dragstart', (ev) => {
    const th = ev.target.closest('th[data-dev-colhead]');
    if (!th) return;
    ev.stopPropagation();
    fromIdx = Number(th.dataset.devColhead);
    th.classList.add('is-col-dragging');
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(fromIdx));
    }
  });

  head.addEventListener('dragover', (ev) => {
    if (fromIdx === null) return;
    const th = ev.target.closest('th[data-dev-colhead]');
    if (!th) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    const rect = th.getBoundingClientRect();
    const after = ev.clientX > rect.left + rect.width / 2;
    clearColMarks();
    head.querySelector(`th[data-dev-colhead="${fromIdx}"]`)?.classList.add('is-col-dragging');
    th.classList.add(after ? 'is-col-drop-after' : 'is-col-drop-before');
  });

  head.addEventListener('drop', async (ev) => {
    if (fromIdx === null) return;
    const th = ev.target.closest('th[data-dev-colhead]');
    if (!th) return;
    ev.preventDefault();
    ev.stopPropagation();
    const targetIdx = Number(th.dataset.devColhead);
    const rect = th.getBoundingClientRect();
    const after = ev.clientX > rect.left + rect.width / 2;
    const from = fromIdx;
    fromIdx = null;
    clearColMarks();
    // Two steps, because collapsing "insert before slot N" and "move from index F"
    // into one arithmetic is where off-by-one bugs live.
    const slot = after ? targetIdx + 1 : targetIdx;
    const to = slot > from ? slot - 1 : slot;
    if (to === from) return;

    const kind = state.deviceKind;
    const full = (state.deviceColumns?.[kind] || []).map((c) => ({ ...c }));
    if (!full.length) return;
    const visible = full.filter((c) => !c.hidden);
    const moved = visible.splice(from, 1)[0];
    if (!moved) return;
    visible.splice(to, 0, moved);
    // Re-insert the hidden columns at their original slots.
    let vi = 0;
    const next = full.map((c) => (c.hidden ? c : visible[vi++]));
    try {
      const res = await api.saveDeviceColumns(kind, next);
      state.deviceColumns = { ...state.deviceColumns, [kind]: res.columns };
      await loadDevices();
      toast('Column moved', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  head.addEventListener('dragend', () => {
    fromIdx = null;
    clearColMarks();
  });
}

/**
 * The drop marker's labelled pill. It is a real element rather than a
 * pseudo-element because both of a row's pseudo-elements are already spent on the
 * insertion bar and its leading tick — sharing `::before` stretched the pill into a
 * second full-width bar, so the label never appeared on screen.
 */
function setDropPill(tr, side) {
  document.querySelectorAll('.dev-drop-pill').forEach((el) => el.remove());
  if (!tr) return;
  // Attach to the grip CELL, not the row: a <tr> may only contain <td>/<th>, and a
  // stray <span> inside one makes the table layout algorithm redistribute column
  // widths — measured as 1-3px header drift the moment the marker appeared. The
  // grip cell is already `position: relative`, so it is also the right anchor.
  const host = tr.querySelector('td.dev-grip') || tr.firstElementChild;
  if (!host) return;
  const pill = document.createElement('span');
  pill.className = `dev-drop-pill ${side === 'after' ? 'is-after' : 'is-before'}`;
  pill.textContent = 'drop here';
  pill.setAttribute('aria-hidden', 'true');
  host.appendChild(pill);
}

function bindDeviceRowDrag() {
  const table = document.querySelector('.dev-table');
  const wrap = document.querySelector('[data-dev-scroll]');
  if (!table || !wrap || table.dataset.dragBound) return;
  table.dataset.dragBound = '1';

  let fromId = null;
  const clearMarks = () => {
    table.querySelectorAll('.is-drop-before, .is-drop-after, .is-dragging').forEach((el) =>
      el.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging')
    );
    table.querySelectorAll('.dev-drop-pill').forEach((el) => el.remove());
  };
  // Touching ONLY the drop marker. `clearMarks()` also strips `is-dragging` from the
  // row in flight, and re-adding it on every `dragover` meant the drag SOURCE was
  // mutating while the drag was live — Chromium then abandons the gesture, `drop`
  // never fires, and `dragend` reports `dropEffect: 'none'`. The move was silently
  // thrown away, which is exactly "I dragged it and nothing moved".
  const clearDrop = () => {
    table.querySelectorAll('.is-drop-before, .is-drop-after').forEach((el) =>
      el.classList.remove('is-drop-before', 'is-drop-after')
    );
    table.querySelectorAll('.dev-drop-pill').forEach((el) => el.remove());
  };

  // The marker is state, not an animation: `dragover` fires on every pixel of
  // mouse movement, so blindly clearing and re-adding classes repainted the whole
  // table tens of times per second. That churn is what looked like every row
  // lighting up at once. Track the current marker and only touch the DOM when it
  // actually changes.
  let markRow = null;
  let markSide = '';
  // Set while a real `drop` is handled, so the `dragend` that always follows it
  // does not apply the same move a second time.
  let settled = false;

  const setMark = (tr, side) => {
    if (markRow === tr && markSide === side) return;
    if (markRow && markRow !== tr) markRow.classList.remove('is-drop-before', 'is-drop-after');
    clearDrop();
    markRow = tr;
    markSide = side;
    if (tr) tr.classList.add(side === 'after' ? 'is-drop-after' : 'is-drop-before');
    setDropPill(tr, side);
  };
  const resetMark = () => {
    markRow = null;
    markSide = '';
  };

  table.addEventListener('dragstart', (ev) => {
    const grip = ev.target.closest('[data-dev-row] .dev-grip');
    if (!grip) {
      ev.preventDefault();
      return;
    }
    const tr = grip.closest('tr');
    fromId = Number(tr.dataset.devRow);
    resetMark();
    tr.classList.add('is-dragging');
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      // Firefox refuses to start a drag without a payload.
      ev.dataTransfer.setData('text/plain', String(fromId));
    }
  });

  table.addEventListener('dragover', (ev) => {
    if (fromId === null) return;
    const tr = ev.target.closest('tr[data-dev-row]');
    if (!tr) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    const rect = tr.getBoundingClientRect();
    const after = ev.clientY > rect.top + rect.height / 2;
    // A marker that promises a move which cannot happen is the other half of the
    // "the line appeared but nothing moved" complaint: dropping a row above itself
    // and dropping it below itself both leave the order unchanged, so neither
    // should draw a drop line.
    const targetId = Number(tr.dataset.devRow);
    const ids = state.devices.map((d) => Number(d.id));
    const fromIdx = ids.indexOf(fromId);
    const targetIdx = ids.indexOf(targetId);
    const slot = after ? targetIdx + 1 : targetIdx;
    const to = slot > fromIdx ? slot - 1 : slot;
    if (fromIdx < 0 || targetIdx < 0 || to === fromIdx) {
      clearDrop();
      resetMark();
      return;
    }
    setMark(tr, after ? 'after' : 'before');
  });

  /**
   * Commit the move the marker was promising. `to` is the index in the ORIGINAL
   * array where the row should end up.
   */
  const commitMove = async (src, to) => {
    const ids = state.devices.map((d) => Number(d.id));
    const fromIdx = ids.indexOf(src);
    if (fromIdx < 0 || fromIdx === to) return;
    ids.splice(fromIdx, 1);
    ids.splice(to, 0, src);

    // Repaint optimistically from the new order so the drop feels instant.
    const byId = new Map(state.devices.map((d) => [Number(d.id), d]));
    state.devices = ids.map((id) => byId.get(id)).filter(Boolean);
    repaintDeviceRows();

    try {
      await api.reorderDevices(state.deviceKind, ids);
    } catch (err) {
      toast(err.message, 'err');
      await loadDevices();
    }
  };

  table.addEventListener('drop', async (ev) => {
    if (fromId === null) return;
    const tr = ev.target.closest('tr[data-dev-row]');
    if (!tr) return;
    ev.preventDefault();
    const targetId = Number(tr.dataset.devRow);
    const rect = tr.getBoundingClientRect();
    const after = ev.clientY > rect.top + rect.height / 2;
    const src = fromId;
    fromId = null;
    settled = true;
    resetMark();
    clearMarks();
    if (src === targetId) return;

    const ids = state.devices.map((d) => Number(d.id));
    const fromIdx = ids.indexOf(src);
    const targetIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || targetIdx < 0) return;
    // Two steps: the insertion slot in the ORIGINAL array, then shift it down one
    // when the dragged row sat above the drop target and has been lifted out.
    const slot = after ? targetIdx + 1 : targetIdx;
    await commitMove(src, slot > fromIdx ? slot - 1 : slot);
  });

  table.addEventListener('dragend', () => {
    const src = fromId;
    // The browser can abandon a drag it thinks is invalid: no `drop`, just a
    // `dragend` with dropEffect 'none'. Measured 3 times in 8 attempts, which read
    // to the tester as "the line appeared but nothing moved". The marker the user
    // was looking at is a clear statement of intent, so honour it instead of
    // discarding the gesture.
    const pending = markRow ? { targetId: Number(markRow.dataset.devRow), side: markSide } : null;
    const wasSettled = settled;
    fromId = null;
    settled = false;
    resetMark();
    clearMarks();
    if (!src || wasSettled) return;
    if (!pending || src === pending.targetId) return;

    const ids = state.devices.map((d) => Number(d.id));
    const fromIdx = ids.indexOf(src);
    const targetIdx = ids.indexOf(pending.targetId);
    if (fromIdx < 0 || targetIdx < 0) return;
    const slot = pending.side === 'after' ? targetIdx + 1 : targetIdx;
    const to = slot > fromIdx ? slot - 1 : slot;
    if (to === fromIdx) return;
    commitMove(src, to);
  });
}

/** Repaint only the table body + cards, leaving the toolbar (and its caret) alone. */
function repaintDeviceRows() {
  if (state.deviceEdit) {
    // Bulk mode renders ONE table, not a desktop and a mobile copy: duplicate
    // inputs meant a hidden twin took part in Tab order and in the dirty-cell
    // count, so one real edit could read as two changes.
    const host = document.querySelector('.dev-bulkhost');
    if (host) host.innerHTML = devicesTableHTML(state.devices);
    bindDeviceRows();
    return;
  }
  const desk = document.querySelector('.dev-desktop');
  const mob = document.querySelector('.dev-mobile');
  if (desk) desk.innerHTML = devicesTableHTML(state.devices);
  if (mob) mob.innerHTML = devicesCardsHTML(state.devices);
  bindDeviceRows();
}

function bindDeviceRows() {
  // Everything in this function is re-created by every repaint, so each binding must
  // live here (guarded by data-bound) and NOT only in bindDevices(). The trailing
  // sheet row's "Add a column" button is the case that proved it: bound once in
  // bindDevices(), it lost its listener the first time a row drag repainted the table
  // and then did nothing at all.
  document.querySelectorAll('[data-bulk-addrow]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => addPendingRow());
  });
  // The trailing "+ Add device" row and the empty state both carry data-device-new
  // and are re-created by every repaint, so they need wiring here and not only in
  // bindDevices().
  document.querySelectorAll('[data-device-new]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => openDeviceForm());
  });
  // "Add a column" sits beside "Add a row" in the trailing sheet row.
  document.querySelectorAll('[data-device-addcol]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => openColumnEditor({ addNew: true }));
  });
  document.querySelectorAll('[data-device-edit]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => {
      const d = state.devices.find((x) => Number(x.id) === Number(b.dataset.deviceEdit));
      if (d) openDeviceForm(d);
    });
  });
  document.querySelectorAll('[data-device-del]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', async () => {
      const d = state.devices.find((x) => Number(x.id) === Number(b.dataset.deviceDel));
      if (!d) return;
      const ok = await confirmDialog({
        title: 'Delete this device?',
        message: `“${d.name}” will be removed from the inventory for everyone.`,
        confirmLabel: 'Delete device',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteDevice(d.id);
        toast('Device deleted', 'ok');
        await loadDevices();
        await loadStats();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });
  document.querySelectorAll('[data-device-bulk]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => startBulkEdit());
  });
  document.querySelectorAll('[data-bulk-cancel]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', async () => {
      // Only nag when something would actually be thrown away: a user who opened
      // the mode to look around should not have to confirm leaving it.
      if (bulkDirtyCount()) {
        const ok = await confirmDialog({
          title: 'Discard your edits?',
          message: 'The cells you changed will go back to the values currently saved.',
          confirmLabel: 'Discard changes',
          danger: true,
        });
        if (!ok) return;
      }
      cancelBulkEdit();
    });
  });
  document.querySelectorAll('[data-pending-drop]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => {
      removePendingRow(b.dataset.pendingDrop);
      toast('Unsaved row removed', 'info');
    });
  });
  document.querySelectorAll('[data-bulk-save]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => saveBulkEdit(b));
  });
  bindBulkCells();
  bindDeviceRowDrag();
  bindDeviceColumnDrag();
  syncDeviceOverflow();
}

function infoTargets() {
  const out = [];
  for (const c of state.clients) {
    out.push({ id: `client:${c.id}`, client: c, app: null, variant: null });
    for (const a of state.applications.filter((x) => Number(x.clientId) === Number(c.id))) {
      out.push({ id: `application:${a.id}`, client: c, app: a, variant: null });
      // Variants are a note target of their own: the Android build and the iOS
      // build of one application collect different findings.
      for (const v of a.variants || []) {
        out.push({ id: `variant:${v.id}`, client: c, app: a, variant: v });
      }
    }
  }
  return out;
}

function infoSelected() {
  const [scope, id] = String(state.infoTarget || '').split(':');
  if (!scope || !id) return null;
  if (scope === 'client') {
    const client = state.clients.find((c) => Number(c.id) === Number(id));
    return client ? { scope: 'client', scopeId: Number(id), client, app: null, variant: null } : null;
  }
  if (scope === 'variant') {
    for (const a of state.applications) {
      const v = (a.variants || []).find((x) => Number(x.id) === Number(id));
      if (!v) continue;
      const owner = state.clients.find((c) => Number(c.id) === Number(a.clientId));
      return { scope: 'variant', scopeId: Number(v.id), client: owner, app: a, variant: v };
    }
    return null;
  }
  const app = state.applications.find((a) => Number(a.id) === Number(id));
  if (!app) return null;
  const owner = state.clients.find((c) => Number(c.id) === Number(app.clientId));
  return { scope: 'application', scopeId: Number(app.id), client: owner, app, variant: null };
}

/**
 * Two-pane layout: a target list on the left, the note library on the right.
 * Notes are plain Markdown-ish text rendered as paragraphs — deliberately not
 * a rich-text editor, because the point is that each application records
 * whatever shape of information its tester needs.
 */
function infoHTML() {
  const sel = infoSelected();
  const targets = infoTargets();

  if (!targets.length) {
    return `<div class="empty">
      <div class="icon">${icon.book(28)}</div>
      <h3>No clients or applications yet</h3>
      <p>Add a client and its applications first — notes hang off them.</p>
    </div>`;
  }

  // One collapsible group per client instead of a flat list: a client with a dozen
  // applications used to push everything else out of reach, and the flat list made
  // it hard to tell which applications belonged together.
  const isActive = (t) => {
    if (!sel) return false;
    if (!t.app) return sel.scope === 'client' && Number(sel.scopeId) === Number(t.client.id);
    if (t.variant) return sel.scope === 'variant' && Number(sel.scopeId) === Number(t.variant.id);
    return sel.scope === 'application' && Number(sel.scopeId) === Number(t.app.id);
  };

  const list = state.clients
    .map((c) => {
      const apps = state.applications.filter((a) => Number(a.clientId) === Number(c.id));
      const clientTarget = targets.find((t) => !t.app && Number(t.client.id) === Number(c.id));
      const clientActive = clientTarget ? isActive(clientTarget) : false;
      // True for an application of this client AND for a variant of one, so a
      // selected variant cannot end up inside a collapsed group.
      const appActive =
        !!sel &&
        sel.scope !== 'client' &&
        !!sel.app &&
        Number(sel.app.clientId) === Number(c.id);
      // Open by default when it holds the current selection, otherwise start
      // closed — but remember an explicit open/closed choice for this session.
      const remembered = state.infoOpen?.[c.id];
      const open = remembered === undefined ? clientActive || appActive : remembered;
      const count = clientTarget ? (state.infoCounts?.[clientTarget.id] ?? 0) : 0;
      const appRows = apps
        .map((a) => {
          const act = isActive({ app: a, client: c });
          const n = state.infoCounts?.[`application:${a.id}`] ?? 0;
          const row = `<button class="info-target is-app ${act ? 'on' : ''}" data-info-target="application:${a.id}">
            <span class="it-glyph">${icon.apps(14)}</span>
            <span class="it-text"><span class="it-name" title="${h(a.name)}">${h(a.name)}</span></span>
            ${n ? `<span class="it-count">${n}</span>` : ''}
          </button>`;
          // A third level only when the application actually has variants — the
          // level is optional, and an empty "Variants" heading under every app
          // would read as broken data.
          const variantRows = (a.variants || [])
            .map((v) => {
              const vn = state.infoCounts?.[`variant:${v.id}`] ?? 0;
              return `<button class="info-target is-variant ${isActive({ app: a, client: c, variant: v }) ? 'on' : ''}"
                  data-info-target="variant:${v.id}">
                <span class="it-glyph">${icon.layers(13)}</span>
                <span class="it-text"><span class="it-name" title="${h(v.name)}">${h(v.name)}</span></span>
                ${vn ? `<span class="it-count">${vn}</span>` : ''}
              </button>`;
            })
            .join('');
          return variantRows
            ? `<div class="ig-app-block">${row}<div class="ig-variants">${variantRows}</div></div>`
            : row;
        })
        .join('');
      return `<div class="info-group ${open ? 'is-open' : ''}">
        <div class="ig-row">
          <button class="ig-toggle" data-info-toggle="${c.id}" aria-expanded="${open ? 'true' : 'false'}"
            title="${open ? 'Collapse' : 'Expand'} ${h(c.name)}">
            <span class="ig-chev">${icon.chevronDown(14)}</span>
          </button>
          <button class="info-target is-client ${clientActive ? 'on' : ''}" data-info-target="client:${c.id}">
            <span class="it-glyph">${icon.building(14)}</span>
            <span class="it-text"><span class="it-name" title="${h(c.name)}">${h(c.name)}</span></span>
            ${count ? `<span class="it-count">${count}</span>` : ''}
          </button>
        </div>
        ${apps.length ? `<div class="ig-apps">${appRows}</div>` : `<div class="ig-none">No applications</div>`}
      </div>`;
    })
    .join('');

  const head = sel
    ? `<div class="info-head">
        <div>
          <h2>${h(sel.variant ? sel.variant.name : sel.app ? sel.app.name : sel.client.name)}</h2>
          <p class="info-sub">${
            sel.variant
              ? `${icon.building(12)} ${h(sel.client?.name || '')} · ${h(sel.app?.name || '')} · sub app`
              : sel.app
                ? `${icon.building(12)} ${h(sel.client?.name || '')} · application`
                : 'Client-level notes — shared by every application below it'
          }</p>
        </div>
        <button class="btn btn-primary" data-info-new>${icon.plus()} New note</button>
      </div>`
    : `<div class="info-head">
        <div><h2>Information center</h2>
        <p class="info-sub">Pick a client, an application or a sub app on the left.</p></div>
      </div>`;

  return `<div class="info-layout">
    <aside class="info-nav">
      <div class="info-nav-label">Clients &amp; applications</div>
      <div class="info-targets">${list}</div>
    </aside>
    <section class="info-pane">
      ${head}
      <div class="info-search">
        <span class="is-glyph">${icon.search()}</span>
        <input class="input" id="info-search" placeholder="Search title, content, category…"
          autocomplete="off" aria-label="Search all notes" value="${h(state.infoQuery || '')}" />
        <button class="btn btn-sm is-clear" data-info-clear ${state.infoQuery ? '' : 'hidden'}>Clear</button>
      </div>
      ${sel && !state.infoQuery ? infoEnvHTML(sel) + infoDocsHTML(sel) : ''}
      <div id="info-entries">${
        state.infoQuery ? infoSearchHTML() : sel ? infoEntriesHTML(sel) : infoBlankHTML()
      }</div>
    </section>
  </div>`;
}

/**
 * The environment whose sheets are on screen.
 *
 * Clients have no environments, so their answer is always Dev even if an
 * application the user was just looking at left a Prod choice behind.
 */
function currentEnv() {
  const sel = infoSelected();
  if (!sel || sel.scope === 'client') return 'Dev';
  return state.infoEnv[sel.scopeId] === 'Prod' ? 'Prod' : 'Dev';
}

/** The Dev / Prod switch above the application sheets. */
function infoEnvHTML(sel) {
  if (sel.scope === 'client') return '';
  const env = currentEnv();
  const prod = env === 'Prod';
  return `<div class="doc-env" role="tablist" aria-label="Environment">
      <div class="doc-env-tabs">
        <button class="doc-env-tab ${prod ? '' : 'on'}" data-doc-env="Dev" role="tab"
          aria-selected="${prod ? 'false' : 'true'}">${icon.globe(13)} Dev</button>
        <button class="doc-env-tab ${prod ? 'on' : ''}" data-doc-env="Prod" role="tab"
          aria-selected="${prod ? 'true' : 'false'}">${icon.shield(13)} Prod</button>
      </div>
      <span class="doc-env-note" data-env="${env}">${
        prod
          ? 'Production sheets — separate notes and table, never mixed with Dev.'
          : 'Development sheets — the default. Production has its own page.'
      }</span>
    </div>`;
}

/**
 * The two fixed blocks every target owns: a free-text sheet and a table.
 *
 * Both render READ-ONLY until the user clicks Edit. A credentials table you can
 * clobber by mis-clicking is a support ticket waiting to happen, and read-only
 * also means the text keeps its exact indentation while browsing.
 */
function infoDocsHTML(sel) {
  const doc = state.doc;
  const label = sel.variant ? sel.variant.name : sel.app ? sel.app.name : sel.client.name;
  const editing = state.docEditing || '';
  // The switch above says which environment is live, but a sheet is often read
  // scrolled away from it — and "Table" alone says nothing about whether these are
  // production credentials. Each block heading therefore carries the environment.
  const env = currentEnv();
  const envPill =
    sel.scope === 'client'
      ? ''
      : `<span class="doc-env-pill" data-env="${env}">${
          env === 'Prod' ? icon.shield(10) : icon.globe(10)
        }${env}</span>`;

  if (doc === undefined) {
    return `<div class="doc-block"><div class="doc-skel"><div class="skeleton"></div><div class="skeleton"></div></div></div>`;
  }

  // --- text sheet ---
  const editingText = editing === 'text';
  const textHead = `<div class="doc-head" data-env="${env}">
      <div class="doc-title">
        <span class="doc-glyph">${icon.fileText(15)}</span>
        <div>
          <h3>Notes ${envPill}</h3>
          <p class="doc-sub">Free-form notes for ${h(label)} — Markdown supported</p>
        </div>
      </div>
      <div class="doc-actions">
        ${
          editingText
            ? `<button class="btn btn-sm btn-primary" data-doc-save="text">${icon.check(13)} Save</button>
               <button class="btn btn-sm" data-doc-cancel>Cancel</button>`
            : `<button class="btn btn-sm" data-doc-edit="text">${icon.edit(13)} Edit</button>`
        }
      </div>
    </div>`;

  let textBody;
  if (editingText) {
    textBody = `<textarea class="textarea code doc-textarea" id="doc-text" rows="12"
      placeholder="Markdown. Headings, lists, **bold**, code, fenced blocks, tables and links…">${h(doc.text)}</textarea>
      <span class="hint">Markdown: <code># heading</code>, <code>- list</code>, <code>**bold**</code>,
        <code>\`code\`</code>, <code>[text](url)</code>, <code>| table |</code>. Wrap anything that must
        keep its exact alignment in a <code>\`\`\`</code> fence. Ctrl/⌘+Enter saves.</span>`;
  } else if (doc.text.trim()) {
    // Markdown, not a <pre>: the sheet is long prose and headings/lists/bold make
    // it scannable. A fenced code block keeps its exact alignment, which is what
    // the <pre> was really for.
    textBody = `<div class="doc-text doc-md">${renderMarkdown(doc.text)}</div>`;
  } else {
    textBody = `<div class="doc-empty">
      <p>Nothing written yet.</p>
      <button class="btn btn-sm" data-doc-edit="text">${icon.plus(13)} Write something</button>
    </div>`;
  }

  // --- table ---
  const editingTable = editing === 'table';
  const cols = doc.table?.columns || [];
  const rows = doc.table?.rows || [];
  const tableHead = `<div class="doc-head" data-env="${env}">
      <div class="doc-title">
        <span class="doc-glyph">${icon.tableGrid(15)}</span>
        <div>
          <h3>Table ${envPill}</h3>
          <p class="doc-sub">Grid for ${h(label)} — credentials, accounts, endpoints</p>
        </div>
      </div>
      <div class="doc-actions">
        ${
          editingTable
            ? `<button class="btn btn-sm btn-primary" data-doc-save="table">${icon.check(13)} Save</button>
               <button class="btn btn-sm" data-doc-cancel>Cancel</button>`
            : `<button class="btn btn-sm" data-doc-edit="table">${icon.edit(13)} Edit</button>`
        }
      </div>
    </div>`;

  let tableBody;
  if (editingTable) {
    tableBody = `${infoTableEditorHTML(doc.table, 'doc-table')}`;
  } else if (cols.length && rows.length) {
    tableBody = infoTableHTML({ table: doc.table });
  } else if (cols.length) {
    tableBody = `<div class="doc-empty"><p>A table with ${cols.length} column${
      cols.length === 1 ? '' : 's'
    } and no rows.</p><button class="btn btn-sm" data-doc-edit="table">${icon.edit(13)} Add rows</button></div>`;
  } else {
    tableBody = `<div class="doc-empty">
      <p>No table yet.</p>
      <button class="btn btn-sm" data-doc-edit="table">${icon.plus(13)} Build a table</button>
    </div>`;
  }

  const stamp = doc.updatedAt
    ? `<div class="doc-foot">Last edited${doc.updatedByName ? ` by ${h(doc.updatedByName)}` : ''} · ${h(
        fmtRelative(doc.updatedAt)
      )}</div>`
    : '';

  // Table first, notes below it — the short scannable block above the long prose.
  return `<section class="doc-block${editingTable ? ' is-editing' : ''}">${tableHead}<div class="doc-body" data-doc-body="table">${tableBody}</div>${stamp}</section>
    <section class="doc-block${editingText ? ' is-editing' : ''}">${textHead}<div class="doc-body">${textBody}</div></section>`;
}

function infoBlankHTML() {
  return `<div class="empty info-empty">
    <div class="icon">${icon.book(26)}</div>
    <h3>Nothing selected</h3>
    <p>Choose a client or one of its applications to see and edit its notes.</p>
  </div>`;
}

function infoEntriesHTML(sel) {
  const entries = state.info || [];
  // Notes are per sheet, so an empty Prod list is normal rather than lost data —
  // the message has to say which sheet it is talking about.
  const onSheet = sel.scope === 'client' ? '' : ` on the ${currentEnv()} sheet`;
  if (!entries.length) {
    return `<div class="empty info-empty">
      <div class="icon">${icon.book(26)}</div>
      <h3>No extra notes${onSheet}</h3>
      <p>Add extra notes as cards — one per topic, such as a single error, link or finding.
      They are filed on the sheet you are looking at, separately from the Notes document above.</p>
      <button class="btn btn-primary" data-info-new>${icon.plus()} Add a note</button>
    </div>`;
  }
  return `<section class="entries-block">
    <div class="entries-head">
      <h3>Extra notes <span class="entries-count">${entries.length}</span></h3>
      <span>${sel.scope === 'client' ? 'Client-wide, shared by every application' : `Filed on the ${currentEnv()} sheet`}</span>
    </div>
    <div class="info-entries">${entries.map(infoCardHTML).join('')}</div>
  </section>`;
}

/**
 * Renders one note. The body is rendered as escaped preformatted text rather
 * than parsed Markdown: no dependencies, no XSS surface, and the alignment of
 * a pasted credential block or error log survives verbatim.
 */
/**
 * Cross-client results. Each row names the client AND the application, because a
 * result without its location is useless once you have more than a few notes.
 */
function infoSearchHTML() {
  if (state.infoSearching) {
    return `<div class="empty"><div class="icon">${icon.search(24)}</div><h3>Searching…</h3></div>`;
  }
  const results = state.infoResults || [];
  if (!results.length) {
    return `<div class="empty">
      <div class="icon">${icon.search(24)}</div>
      <h3>No notes match “${h(state.infoQuery)}”</h3>
      <p>Try a shorter word, or a value from inside a credentials table.</p>
    </div>`;
  }
  return `<div class="is-count">${results.length} note${results.length === 1 ? '' : 's'} found</div>
    <div class="is-results">${results
      .map(
        (r) => `<button class="is-row" data-info-goto="${r.id}">
          <span class="is-row-top">
            <span class="is-row-title">${h(r.title || 'Untitled note')}</span>
            <span class="ic-cat" data-tone="${infoTone(r.category)}">${h(r.category)}</span>
            ${r.kind === 'table' ? `<span class="is-kind">${icon.tableGrid(11)} table</span>` : ''}
          </span>
          <span class="is-row-where">${icon.building(11)} ${h(r.clientName || '—')}${
            r.appName ? ` · ${h(r.appName)}` : ' · client note'
          }${r.variantName ? ` · ${h(r.variantName)}` : ''}${
            r.scope === 'client'
              ? ''
              : `<span class="is-env" data-env="${r.env === 'Prod' ? 'Prod' : 'Dev'}">${
                  r.env === 'Prod' ? 'PROD' : 'DEV'
                }</span>`
          }</span>
          <span class="is-row-snip">${h(infoSnippet(r))}</span>
        </button>`
      )
      .join('')}</div>`;
}

/** The matching fragment, so a hit inside a long note is not a mystery. */
function infoSnippet(r) {
  const q = (state.infoQuery || '').toLowerCase();
  const source =
    r.kind === 'table'
      ? [r.table?.columns || [], ...(r.table?.rows || [])].map((x) => x.join(' ')).join(' · ')
      : r.body || '';
  const text = source.replace(/\s+/g, ' ').trim();
  const at = text.toLowerCase().indexOf(q);
  if (at < 0) return text.slice(0, 120);
  const from = Math.max(0, at - 40);
  return `${from > 0 ? '…' : ''}${text.slice(from, from + 130)}`;
}

function infoCardHTML(e) {
  return `<article class="info-card" data-entry="${e.id}">
    <div class="ic-head">
      <span class="ic-cat" data-tone="${infoTone(e.category)}">${h(e.category)}</span>
      ${
        e.scope === 'client'
          ? ''
          : `<span class="is-env ic-env" data-env="${e.env === 'Prod' ? 'Prod' : 'Dev'}">${
              e.env === 'Prod' ? 'PROD' : 'DEV'
            }</span>`
      }
      <h3 class="ic-title">${h(e.title || 'Untitled note')}</h3>
      ${e.pinned ? `<span class="ic-pin" title="Pinned">${icon.pin(13)}</span>` : ''}
      <div class="ic-actions">
        <button class="btn btn-icon" data-info-pin="${e.id}" title="${e.pinned ? 'Unpin' : 'Pin to top'}"
          aria-label="${e.pinned ? 'Unpin' : 'Pin to top'}">${icon.pin(14)}</button>
        <button class="btn btn-icon" data-info-copy="${e.id}" title="Copy body"
          aria-label="Copy note body">${icon.copy(14)}</button>
        <button class="btn btn-icon" data-info-edit="${e.id}" title="Edit"
          aria-label="Edit note">${icon.edit(14)}</button>
        <button class="btn btn-icon btn-icon-danger" data-info-del="${e.id}" title="Delete"
          aria-label="Delete note">${icon.trash(14)}</button>
      </div>
    </div>
    ${e.kind === 'table' ? infoTableHTML(e) : e.body ? `<pre class="ic-body">${h(e.body)}</pre>` : ''}
    <div class="ic-foot">
      <span>${h(e.createdByName || 'Unknown')}</span>
      <span>·</span>
      <span>${h(fmtRelative(e.updatedAt))}</span>
    </div>
  </article>`;
}

/**
 * Grid notes render as a real <table> so column alignment is done by the browser
 * rather than by counting spaces in a <pre>. Every cell is escaped, so a paste
 * containing markup stays literal.
 *
 * This is the Devices sheet, verbatim: the same `.dev-table`, the same view-mode
 * markup, the same column personalities. The inventory's first page is deliberately
 * control-free — no grip column, no per-row buttons, no `+` in the header and no
 * "Add row" row; every one of those lives behind "Edit all rows" — and the sheet
 * follows that rule exactly, with its own Edit button opening the grid editor. Two
 * tables that render the same cells but different chrome are not the same table, and
 * that difference is what a reader notices first.
 *
 * Note cards call the same function: identical look, nothing to persist, so no
 * controls either way.
 */
function infoTableHTML(e) {
  const cols = e.table?.columns || [];
  const rows = e.table?.rows || [];
  if (!cols.length) {
    return `<div class="ic-tempty">This table has no columns yet.</div>`;
  }

  return `<div class="dev-tablewrap" data-sheet-scroll>
      <span class="dev-scrollfx left" aria-hidden="true"></span>
      <span class="dev-scrollfx right" aria-hidden="true"></span>
      <table class="dev-table ic-table">
        <thead><tr>
          ${cols
            .map(
              (c) =>
                `<th><span class="dev-h-inner"><span class="dev-h-label">${h(c)}</span></span></th>`
            )
            .join('')}
        </tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
            ${cols
              .map((_, i) => {
                const v = String(r[i] ?? '');
                if (!v.trim()) return '<td class="dev-empty-cell">—</td>';
                // Mirror the Devices sheet's column personalities, since the sheet's
                // columns are user-named and carry no type: the first column is what
                // people scan (name), the last is prose (notes), and the middle holds
                // identifiers and credentials, which are transcribed rather than read.
                if (i === 0) return `<td class="dev-name">${h(v)}</td>`;
                if (i === cols.length - 1) return `<td class="dev-notes" title="${h(v)}">${h(v)}</td>`;
                return `<td class="dev-mono-cell">${h(v)}</td>`;
              })
              .join('')}
          </tr>`
          )
          .join('')}
        </tbody>
      </table>
    </div>
    <p class="dev-scrollhint">${icon.chevronRight(12)} Scroll sideways for the remaining columns</p>`;
}

/**
 * Runs a cross-client search. Kept separate from `loadInfo` because it must not
 * touch the selected target: typing a query should never change what the left
 * list is pointing at.
 */
async function runInfoSearch(q) {
  if (!q) {
    state.infoQuery = '';
    state.infoResults = [];
    state.infoSearching = false;
    const host = document.getElementById('info-entries');
    const sel = infoSelected();
    if (host) host.innerHTML = sel ? infoEntriesHTML(sel) : infoBlankHTML();
    const clear = document.querySelector('[data-info-clear]');
    if (clear) clear.hidden = true;
    return;
  }
  state.infoQuery = q;
  state.infoSearching = true;
  const host = document.getElementById('info-entries');
  if (host) host.innerHTML = infoSearchHTML();
  const clear = document.querySelector('[data-info-clear]');
  if (clear) clear.hidden = false;
  try {
    const res = await api.searchInfo(q);
    // Ignore a stale response if the query moved on while this was in flight.
    if (state.infoQuery !== q) return;
    state.infoResults = res.results || [];
  } catch (err) {
    if (state.infoQuery !== q) return;
    state.infoResults = [];
    toast(err.message, 'err');
  }
  state.infoSearching = false;
  if (state.infoQuery !== q) return;
  const host2 = document.getElementById('info-entries');
  if (host2) host2.innerHTML = infoSearchHTML();
  // Re-bind only the result rows; the rest of the page did not change.
  host2?.querySelectorAll('[data-info-goto]').forEach((b) =>
    b.addEventListener('click', () => openInfoResult(Number(b.dataset.infoGoto)))
  );
}

/**
 * Jumps from a search hit to the note's own page.
 * The selection lives in `state.infoTarget` as a `scope:id` string — assigning
 * anything else (an id alone) leaves the pane with no selection, which made the
 * page fall back to "Information center" with no notes.
 */
async function openInfoResult(entryId) {
  const entry = (state.infoResults || []).find((r) => Number(r.id) === Number(entryId));
  if (!entry) return;
  state.infoTarget = `${entry.scope}:${entry.scopeId}`;
  // Persisted like any other selection, or a reload would drop the jump and land
  // on whatever target the picker last wrote.
  localStorage.setItem('opm-info-target', state.infoTarget);
  state.infoQuery = '';
  state.infoResults = [];
  // Jump to the sheet the note actually lives on. A Prod match must not land on
  // the Dev page, where the note would appear to be missing.
  if (entry.scope !== 'client') {
    state.infoEnv[entry.scopeId] = entry.env === 'Prod' ? 'Prod' : 'Dev';
  }
  await loadInfo(entry.scope, entry.scopeId, currentEnv());
  mountContent();
  document.querySelector(`[data-entry="${entry.id}"]`)?.scrollIntoView({ block: 'center' });
}

function infoFormHTML(entry) {
  const categories = ['General', 'Credential', 'Common Error', 'Link', 'Access', 'Config'];
  const kind = entry?.kind === 'table' ? 'table' : 'text';
  return `<div class="field">
      <label for="i-title">Title</label>
      <input class="input" id="i-title" placeholder="e.g. Admin login, 500 on /transfer…"
        value="${h(entry?.title || '')}" maxlength="120" />
    </div>
    <div class="field">
      <label>Type</label>
      <input type="hidden" id="i-kind" value="${kind}" />
      <div class="segmented" data-segmented="kind" role="group" aria-label="Note type">
        <button type="button" class="seg" data-kind="text">${icon.fileText(13)} Text</button>
        <button type="button" class="seg" data-kind="table">${icon.tableGrid(13)} Table</button>
      </div>
      <span class="hint" id="i-kind-hint"></span>
    </div>
    <div class="field">
      <label for="i-cat">Category</label>
      <input class="input" id="i-cat" list="i-cat-list" placeholder="General"
        value="${h(entry?.category || 'General')}" maxlength="28" />
      <datalist id="i-cat-list">${categories.map((c) => `<option value="${c}"></option>`).join('')}</datalist>
      <span class="hint">Free text — use whatever grouping suits this application.</span>
    </div>
    <div class="field" data-kind-panel="text">
      <label for="i-body">Content</label>
      <textarea class="textarea code" id="i-body" rows="12"
        placeholder="Anything: credentials, common errors, useful links, quirks…">${h(entry?.body || '')}</textarea>
      <span class="hint">Plain text. Line breaks and indentation are kept exactly as typed.</span>
    </div>
    <div class="field" data-kind-panel="table" hidden>
      <label>Table</label>
      ${infoTableEditorHTML(entry?.table)}
      <span class="hint">Tab moves to the next cell and Enter adds a row. Drag nothing — each column header has
        its own move and delete buttons, and pasting a block of values fills downwards.</span>
    </div>`;
}

/**
 * The grid editor. Kept as plain DOM over a JS model (`readTable`/`writeTable`)
 * rather than making every cell contenteditable: re-rendering from the model on
 * each structural change means row/column insert, delete and move cannot drift
 * out of sync with what is on screen.
 */
function infoTableEditorHTML(table, id = 'i-table') {
  const cols = table?.columns?.length ? table.columns : ['Role', 'Username', 'Password', 'Notes'];
  const rows = table?.rows?.length ? table.rows : [['', '', '', '']];
  // The starting model rides along in a data attribute: the grid itself starts
  // empty, and seeding the editor from the DOM would then read back nothing.
  return `<div class="te" id="${id}" data-init="${h(JSON.stringify({ columns: cols, rows }))}">
    <div class="te-scroll"><table class="te-grid"></table></div>
    <div class="te-actions">
      <button type="button" class="btn btn-sm" data-te-row>${icon.rowPlus(13)} Row</button>
      <button type="button" class="btn btn-sm" data-te-col>${icon.colPlus(13)} Column</button>
      <span class="te-count"></span>
    </div>
  </div>`;
}

/**
 * Reads the grid currently on screen back into `{ columns, rows }`.
 * Reading from the DOM on demand (instead of keeping a second copy in JS) means
 * there is exactly one source of truth: whatever the user can see.
 */
function readTable(root) {
  const grid = root.querySelector('.te-grid');
  if (!grid) return { columns: [], rows: [] };
  const headCells = [...grid.querySelectorAll('thead th input')];
  const columns = headCells.map((i) => i.value);

  if (grid.dataset.model) {
    // A move/delete was applied to the model but not yet to the DOM? No — the DOM
    // is always re-rendered after those, so this branch stays unreachable. Kept
    // explicit so the invariant is obvious.
  }

  const rows = [...grid.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td[data-cell] input')].map((i) => i.value)
  );
  return { columns, rows };
}

/** Paints the editor table from a model, wiring every control it renders. */
function writeTable(root, model, opts = {}) {
  const grid = root.querySelector('.te-grid');
  const cols = model.columns || [];
  const rows = model.rows || [];
  const focus = opts.focus;

  grid.innerHTML = `<thead><tr>${cols
    .map(
      (c, ci) => `<th data-colhead="${ci}" draggable="true">
        <div class="te-th">
          <button type="button" class="te-grip" data-col-drag="${ci}" draggable="false"
            title="Drag to move this column" aria-label="Drag to move column ${ci + 1}">${icon.grip(12)}</button>
          <input class="te-cinput" value="${h(c)}" placeholder="Column" maxlength="60"
            data-col="${ci}" aria-label="Column ${ci + 1} name" />
          <div class="te-th-acts">
            <button type="button" class="te-mini" data-col-move="-1" data-ci="${ci}"
              title="Move column left" aria-label="Move column left" ${ci === 0 ? 'disabled' : ''}>${icon.arrowLeft(12)}</button>
            <button type="button" class="te-mini" data-col-move="1" data-ci="${ci}"
              title="Move column right" aria-label="Move column right" ${ci === cols.length - 1 ? 'disabled' : ''}>${icon.arrowRight(12)}</button>
            <button type="button" class="te-mini te-mini-danger" data-col-del="${ci}"
              title="Delete column" aria-label="Delete column" ${cols.length <= 1 ? 'disabled' : ''}>${icon.x(12)}</button>
          </div>
        </div>
      </th>`
    )
    .join('')}<th class="te-th-row"></th></tr></thead>
    <tbody>${rows
      .map(
        (r, ri) => `<tr>
        ${cols
          .map(
            (_, ci) => `<td data-cell="${ci}"><input class="te-input" value="${h(r[ci] ?? '')}"
              data-r="${ri}" data-c="${ci}" aria-label="Row ${ri + 1} column ${ci + 1}" /></td>`
          )
          .join('')}
        <td class="te-rowacts">
          <button type="button" class="te-mini" data-row-move="-1" data-ri="${ri}"
            title="Move row up" aria-label="Move row up" ${ri === 0 ? 'disabled' : ''}>${icon.arrowUp(12)}</button>
          <button type="button" class="te-mini" data-row-move="1" data-ri="${ri}"
            title="Move row down" aria-label="Move row down" ${ri === rows.length - 1 ? 'disabled' : ''}>${icon.arrowDown(12)}</button>
          <button type="button" class="te-mini te-mini-danger" data-row-del="${ri}"
            title="Delete row" aria-label="Delete row" ${rows.length <= 1 ? 'disabled' : ''}>${icon.x(12)}</button>
        </td>
      </tr>`
      )
      .join('')}</tbody>`;

  const count = root.querySelector('.te-count');
  if (count) count.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'} · ${cols.length} column${cols.length === 1 ? '' : 's'}`;

  if (focus) {
    const target = grid.querySelector(focus);
    if (target) {
      target.focus();
      if (target.select) target.select();
    }
  }
}

/** Wires every control inside one table editor. Called once per mounted editor. */
function bindTableEditor(root) {
  const grid = root.querySelector('.te-grid');
  if (!grid) return;

  const rebuild = (model, focus) => {
    writeTable(root, model, { focus });
    // The editor lives inside a modal that owns the type switch; ask it to
    // repaint so the hint/segmented state stays correct after a structural edit.
    root.closest('.modal')?._syncKind?.();
  };

  // Structural changes are delegated so they survive every re-render.
  root.addEventListener('click', (ev) => {
    const model = readTable(root);

    const rowMove = ev.target.closest('[data-row-move]');
    if (rowMove) {
      const ri = Number(rowMove.dataset.ri);
      const dir = Number(rowMove.dataset.rowMove);
      const to = ri + dir;
      if (to < 0 || to >= model.rows.length) return;
      [model.rows[ri], model.rows[to]] = [model.rows[to], model.rows[ri]];
      rebuild(model, `[data-r="${to}"][data-c="0"]`);
      return;
    }

    const rowDel = ev.target.closest('[data-row-del]');
    if (rowDel) {
      const ri = Number(rowDel.dataset.rowDel);
      if (model.rows.length <= 1) return;
      model.rows.splice(ri, 1);
      rebuild(model, `[data-r="${Math.min(ri, model.rows.length - 1)}"][data-c="0"]`);
      return;
    }

    const colMove = ev.target.closest('[data-col-move]');
    if (colMove) {
      const ci = Number(colMove.dataset.ci);
      const dir = Number(colMove.dataset.colMove);
      const to = ci + dir;
      if (to < 0 || to >= model.columns.length) return;
      [model.columns[ci], model.columns[to]] = [model.columns[to], model.columns[ci]];
      // Move the whole column of cells with the header, or the data would stay
      // behind and silently reassign itself to a different label.
      model.rows = model.rows.map((r) => {
        const copy = r.slice();
        [copy[ci], copy[to]] = [copy[to], copy[ci]];
        return copy;
      });
      rebuild(model, `[data-col="${to}"]`);
      return;
    }

    const colDel = ev.target.closest('[data-col-del]');
    if (colDel) {
      const ci = Number(colDel.dataset.colDel);
      if (model.columns.length <= 1) return;
      model.columns.splice(ci, 1);
      model.rows = model.rows.map((r) => r.filter((_, i) => i !== ci));
      rebuild(model, `[data-col="${Math.min(ci, model.columns.length - 1)}"]`);
      return;
    }

    if (ev.target.closest('[data-te-row]')) {
      model.rows.push(model.columns.map(() => ''));
      rebuild(model, `[data-r="${model.rows.length - 1}"][data-c="0"]`);
      return;
    }

    if (ev.target.closest('[data-te-col]')) {
      model.columns.push(`Column ${model.columns.length + 1}`);
      model.rows = model.rows.map((r) => [...r, '']);
      rebuild(model, `[data-col="${model.columns.length - 1}"]`);
    }
  });

  // ---- drag to reorder columns ----
  // The model is the single source of truth: dragging rewrites column order and
  // rotates every row's cells with it, then the table repaints. Native HTML5 DnD
  // is used rather than pointer events so the drag image and autoscroll come for
  // free; the arrow buttons stay as the keyboard/pointer fallback.
  let dragFrom = -1;
  const clearMarks = () => {
    grid.querySelectorAll('.is-drop-before, .is-drop-after, .is-dragging').forEach((el) =>
      el.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging')
    );
  };

  const moveColumn = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    const model = readTable(root);
    if (from >= model.columns.length || to >= model.columns.length) return;
    const [col] = model.columns.splice(from, 1);
    model.columns.splice(to, 0, col);
    // Rotate the cells with their header, or the data silently re-labels itself.
    model.rows = model.rows.map((r) => {
      const copy = r.slice();
      const [cell] = copy.splice(from, 1);
      copy.splice(to, 0, cell);
      return copy;
    });
    rebuild(model, `[data-col="${to}"]`);
  };

  grid.addEventListener('dragstart', (ev) => {
    const th = ev.target.closest('th[data-colhead]');
    if (!th) {
      ev.preventDefault();
      return;
    }
    dragFrom = Number(th.dataset.colhead);
    th.classList.add('is-dragging');
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      // Firefox refuses to start a drag without payload.
      ev.dataTransfer.setData('text/plain', String(dragFrom));
    }
  });

  grid.addEventListener('dragover', (ev) => {
    const th = ev.target.closest('th[data-colhead]');
    if (!th || dragFrom < 0) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    const rect = th.getBoundingClientRect();
    const after = ev.clientX > rect.left + rect.width / 2;
    clearMarks();
    // clearMarks() strips every marker including the drag source's, so re-apply.
    grid.querySelector(`th[data-colhead="${dragFrom}"]`)?.classList.add('is-dragging');
    th.classList.add(after ? 'is-drop-after' : 'is-drop-before');
  });

  grid.addEventListener('drop', (ev) => {
    const th = ev.target.closest('th[data-colhead]');
    if (!th || dragFrom < 0) return;
    ev.preventDefault();
    const target = Number(th.dataset.colhead);
    const rect = th.getBoundingClientRect();
    const after = ev.clientX > rect.left + rect.width / 2;
    // Resolve in two steps: first the insertion slot in the ORIGINAL array,
    // then shift it down by one if the dragged column sat to its left and has
    // already been lifted out. Doing it in one step is where off-by-one bugs live.
    const slot = after ? target + 1 : target;
    const to = slot > dragFrom ? slot - 1 : slot;
    const from = dragFrom;
    dragFrom = -1;
    clearMarks();
    moveColumn(from, to);
  });

  grid.addEventListener('dragend', () => {
    dragFrom = -1;
    clearMarks();
  });

  // Enter adds a row below the current one and lands there — the fastest path for
  // typing a credentials list top to bottom.
  grid.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || !ev.target.matches('[data-cell] input')) return;
    ev.preventDefault();
    const model = readTable(root);
    const ri = Number(ev.target.dataset.r);
    const ci = Number(ev.target.dataset.c);
    model.rows.splice(ri + 1, 0, model.columns.map(() => ''));
    rebuild(model, `[data-r="${ri + 1}"][data-c="${ci}"]`);
  });

  // Pasting a multi-line block fills downwards from the focused cell, which is
  // how a credentials dump actually arrives.
  grid.addEventListener('paste', (ev) => {
    const cell = ev.target.closest('[data-cell] input');
    if (!cell) return;
    const text = ev.clipboardData?.getData('text') || '';
    if (!/\t|\r?\n/.test(text)) return; // single value: let the browser paste it
    ev.preventDefault();
    const model = readTable(root);
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
    const startR = Number(cell.dataset.r);
    const startC = Number(cell.dataset.c);
    lines.forEach((line, li) => {
      const cells = line.split('\t');
      const ri = startR + li;
      while (model.rows.length <= ri) model.rows.push(model.columns.map(() => ''));
      cells.forEach((val, ci2) => {
        const c = startC + ci2;
        while (model.columns.length <= c) {
          model.columns.push(`Column ${model.columns.length + 1}`);
          model.rows.forEach((r) => r.push(''));
        }
        model.rows[ri][c] = val;
      });
    });
    rebuild(model, `[data-r="${startR}"][data-c="${startC}"]`);
  });

  // Tab: the browser already moves to the next input in DOM order, which is the
  // natural left-to-right/top-to-bottom order inside the grid. Shift+Tab from the
  // very first cell would otherwise escape into the modal chrome, so wrap it.
  grid.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab' || ev.shiftKey) return;
    const inputs = [...grid.querySelectorAll('tbody input[data-cell]')];
    if (ev.target !== inputs[inputs.length - 1]) return;
    ev.preventDefault();
    const model = readTable(root);
    model.rows.push(model.columns.map(() => ''));
    rebuild(model, `[data-r="${model.rows.length - 1}"][data-c="0"]`);
  });

  // Seed from the embedded model on first mount; afterwards the DOM is the truth.
  const seeded = readTable(root);
  if (!seeded.columns.length) {
    let init = { columns: [], rows: [] };
    try {
      init = JSON.parse(root.dataset.init || '{}');
    } catch {
      init = { columns: [], rows: [] };
    }
    const columns = Array.isArray(init.columns) && init.columns.length ? init.columns : ['Column 1'];
    const rows = (Array.isArray(init.rows) && init.rows.length ? init.rows : [columns.map(() => '')]).map(
      (r) => columns.map((_, i) => String((Array.isArray(r) ? r[i] : '') ?? ''))
    );
    writeTable(root, { columns, rows });
  } else {
    writeTable(root, seeded);
  }
  root.dataset.init = '';
}

function openInfoForm(entry = null) {
  const sel = infoSelected();
  if (!sel) return;
  const editing = Boolean(entry);
  openModal({
    title: editing ? 'Edit note' : 'New note',
    // Naming the sheet matters: the same application has separate Dev and Prod
    // note lists, and "which one am I adding to" is otherwise invisible here.
    subtitle: sel.app
      ? `${sel.variant ? `${sel.variant.name} — ` : ''}${sel.app.name} — ${
          sel.client?.name || ''
        } · ${editing ? entry.env || 'Dev' : currentEnv()} sheet`
      : sel.client?.name,
    wide: true,
    body: infoFormHTML(entry),
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Add note'}</button>`,
    initialFocus: '#i-title',
    onMount: (modal, close) => {
      const save = modal.querySelector('[data-save]');
      modal.querySelector('[data-cancel]').addEventListener('click', close);

      const kindInput = modal.querySelector('#i-kind');
      const kindHint = modal.querySelector('#i-kind-hint');
      const segments = [...modal.querySelectorAll('[data-kind]')];
      const panels = [...modal.querySelectorAll('[data-kind-panel]')];

      // `syncKind` is re-run by the table editor on every structural change, so it
      // is defined once here and exposed on the modal rather than duplicated.
      function syncKind() {
        const kind = kindInput.value === 'table' ? 'table' : 'text';
        segments.forEach((b) => {
          const on = b.dataset.kind === kind;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        panels.forEach((p) => (p.hidden = p.dataset.kindPanel !== kind));
        if (kindHint) {
          kindHint.textContent =
            kind === 'table'
              ? 'A grid — good for credentials or anything with repeating columns.'
              : 'Free-form text — good for notes, links and error logs.';
        }
      }
      modal._syncKind = syncKind;
      syncKind();

      segments.forEach((b) =>
        b.addEventListener('click', () => {
          kindInput.value = b.dataset.kind;
          syncKind();
        })
      );

      const editor = modal.querySelector('#i-table');
      if (editor) bindTableEditor(editor);

      const submit = async () => {
        const kind = kindInput.value === 'table' ? 'table' : 'text';
        const payload = {
          title: modal.querySelector('#i-title').value.trim(),
          category: modal.querySelector('#i-cat').value.trim() || 'General',
          kind,
        };
        // Editing keeps the note on the sheet it already belongs to. The form has
        // no environment control, so without this a Prod note opened while the
        // page was on Dev would be silently re-filed into Dev on save.
        if (editing) payload.env = entry.env || 'Dev';
        if (kind === 'table') {
          const model = readTable(modal.querySelector('#i-table'));
          if (!model.columns.length) {
            toast('Add at least one column', 'err');
            return;
          }
          payload.table = model;
          payload.body = '';
        } else {
          payload.body = modal.querySelector('#i-body').value;
          payload.table = { columns: [], rows: [] };
        }
        if (kind === 'text' && !payload.title && !payload.body.trim()) {
          toast('Give the note a title or some content', 'err');
          modal.querySelector('#i-title').focus();
          return;
        }
        if (kind === 'table' && !payload.title) {
          toast('Give the table a title', 'err');
          modal.querySelector('#i-title').focus();
          return;
        }
        save.disabled = true;
        try {
          if (editing) await api.updateInfo(entry.id, payload);
          else
            await api.createInfo({
              scope: sel.scope,
              scopeId: sel.scopeId,
              // The note belongs to the sheet it was written on, so a Prod note
              // is never visible from the Dev page.
              env: sel.scope === 'client' ? 'Dev' : currentEnv(),
              ...payload,
            });
          close();
          toast(editing ? 'Note updated' : 'Note added', 'ok');
          await loadInfo(sel.scope, sel.scopeId, currentEnv());
          await refreshInfoCounts();
          // Repaint: without this the list kept showing the pre-save cards
          // (state.info was fresh but nothing re-rendered it), so a new note
          // appeared to be missing until the next navigation.
          mountContent();
        } catch (err) {
          toast(err.message, 'err');
          save.disabled = false;
        }
      };
      save.addEventListener('click', submit);
      modal.querySelector('#i-body').addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
      });
      // Ctrl/Cmd+Enter from inside the grid saves too, so the shortcut does not
      // depend on which panel happens to be visible.
      modal.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
      });
    },
  });
}

/** Entry point for the Information center: restore the last target, load it. */
async function loadInfoPage() {
  if (!infoSelected()) state.infoTarget = '';
  localStorage.setItem('opm-info-target', state.infoTarget || '');
  const sel = infoSelected();
  if (!sel) {
    state.info = [];
    mountContent();
    await refreshInfoCounts();
    if (state.nav === 'info') mountContent();
    return;
  }
  mountContent();
  await loadInfo(sel.scope, sel.scopeId, currentEnv());
  await refreshInfoCounts();
  if (state.nav === 'info') mountContent();
}

async function loadInfo(scope, scopeId, env = 'Dev') {
  try {
    // Both halves in flight together: the notes list and the fixed document are
    // always shown side by side, so loading them in sequence would double the
    // perceived wait for no reason.
    const [res, docRes] = await Promise.all([
      api.info(scope, scopeId, env),
      api.doc(scope, scopeId, env),
    ]);
    state.info = res.entries;
    state.doc = docRes.doc;
    state.docEnv = env;
  } catch (err) {
    toast(err.message, 'err');
    state.info = [];
    state.doc = undefined;
  }
}

/**
 * Saves one half of the fixed document. Only the field being edited is sent, so
 * saving the table can never blank the text (and vice versa).
 */
async function saveDoc(part) {
  const sel = infoSelected();
  if (!sel) return;
  const payload = {};
  if (part === 'text') {
    payload.text = document.getElementById('doc-text')?.value ?? '';
  } else {
    const editor = document.getElementById('doc-table');
    if (!editor) return;
    const model = readTable(editor);
    if (!model.columns.length) {
      toast('A table needs at least one column', 'err');
      return;
    }
    payload.table = model;
  }
  try {
    const res = await api.saveDoc(sel.scope, sel.scopeId, payload, currentEnv());
    state.doc = res.doc;
    state.docEditing = '';
    toast(part === 'text' ? 'Notes saved' : 'Table saved', 'ok');
    mountContent();
  } catch (err) {
    toast(err.message, 'err');
  }
}

/**
 * Note counts beside every target. One request per target would be N+1 on a
 * client list, but this page renders once and the counts are cheap; keeping
 * them here means the sidebar list can show "3" without opening each target.
 */
async function refreshInfoCounts() {
  const targets = infoTargets();
  const counts = {};
  await Promise.all(
    targets.map(async (t) => {
      const [scope, id] = t.id.split(':');
      try {
        const res = await api.info(scope, Number(id), 'Dev');
        if (res.entries.length) counts[t.id] = res.entries.length;
      } catch {
        /* a target that vanished mid-render simply has no count */
      }
    })
  );
  state.infoCounts = counts;
}

function bindDocs() {
  document.querySelectorAll('[data-doc-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      state.docEditing = b.dataset.docEdit;
      mountContent();
      // Land the caret in the editor: clicking Edit then having to click again
      // into the field is the kind of friction that reads as "nothing happened".
      const field = b.dataset.docEdit === 'text' ? document.getElementById('doc-text') : null;
      if (field) {
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      }
    })
  );

  document.querySelectorAll('[data-doc-cancel]').forEach((b) =>
    b.addEventListener('click', () => {
      state.docEditing = '';
      mountContent();
    })
  );

  document.querySelectorAll('[data-doc-save]').forEach((b) =>
    b.addEventListener('click', () => saveDoc(b.dataset.docSave))
  );

  const textarea = document.getElementById('doc-text');
  if (textarea) {
    textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveDoc('text');
      if (e.key === 'Escape') {
        state.docEditing = '';
        mountContent();
      }
    });
    // Leave the editor without saving when the text did not change, so a stray
    // click cannot silently discard what was typed.
    textarea.addEventListener('blur', () => {
      if (state.docEditing !== 'text') return;
      if (document.activeElement?.closest?.('.doc-block')) return;
    });
  }

  const editor = document.getElementById('doc-table');
  if (editor) {
    bindTableEditor(editor);
    editor.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveDoc('table');
    });
  }

  // The rendered (non-editing) sheet is the Devices table, so it owns the same
  // overflow cue. Nothing else to wire: its controls live in the editor behind
  // "Edit", exactly as the inventory's live behind "Edit all rows".
  if (!state.docEditing) syncSheetOverflow();
}

function bindInfo() {
  // Collapse/expand a client group. Kept separate from the target buttons so
  // toggling never navigates away from what the user is reading.
  document.querySelectorAll('[data-info-toggle]').forEach((b) =>
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = Number(b.dataset.infoToggle);
      const group = b.closest('.info-group');
      const open = !group.classList.contains('is-open');
      group.classList.toggle('is-open', open);
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      b.title = `${open ? 'Collapse' : 'Expand'} ${group.querySelector('.it-name')?.textContent || ''}`;
      state.infoOpen[id] = open;
    })
  );
  document.querySelectorAll('[data-info-target]').forEach((b) =>
    b.addEventListener('click', async () => {
      state.infoTarget = b.dataset.infoTarget;
      localStorage.setItem('opm-info-target', state.infoTarget);
      const sel = infoSelected();
      if (!sel) return;
      state.info = [];
      // Opening the group whenever its client (or one of its apps, or a variant of
      // one of those) is selected keeps the active row visible: without this a
      // remembered "closed" could hide the very thing the user just clicked.
      if (sel.client) state.infoOpen[sel.client.id] = true;
      // Show the skeleton while the new target's document loads.
      state.doc = undefined;
      state.docEditing = '';
      document.querySelectorAll('[data-info-target]').forEach((x) =>
        x.classList.toggle('on', x.dataset.infoTarget === b.dataset.infoTarget)
      );
      // Read the env AFTER state.infoTarget is set: a client target resolves to Dev
      // even when the previous application was showing Prod.
      await loadInfo(sel.scope, sel.scopeId, currentEnv());
      mountContent();
    })
  );
  // Dev / Prod switch on an application's sheets.
  document.querySelectorAll('[data-doc-env]').forEach((b) =>
    b.addEventListener('click', async () => {
      const sel = infoSelected();
      if (!sel) return;
      const next = b.dataset.docEnv === 'Prod' ? 'Prod' : 'Dev';
      if (next === currentEnv()) return;
      state.infoEnv[sel.scopeId] = next;
      // An unsaved edit belongs to the sheet it was started on, so switching pages
      // drops it rather than silently saving Dev text into the Prod sheet.
      state.docEditing = '';
      state.doc = undefined;
      await loadInfo(sel.scope, sel.scopeId, next);
      mountContent();
    })
  );
  document.querySelectorAll('[data-info-new]').forEach((b) =>
    b.addEventListener('click', () => openInfoForm())
  );
  document.querySelectorAll('[data-info-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openInfoForm(state.info.find((e) => Number(e.id) === Number(b.dataset.infoEdit)))
    )
  );
  document.querySelectorAll('[data-info-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const entry = state.info.find((e) => Number(e.id) === Number(b.dataset.infoDel));
      if (!entry) return;
      const ok = await confirmDialog({
        title: 'Delete this note?',
        message: `“${entry.title || 'Untitled note'}” will be removed for everyone.`,
        confirmLabel: 'Delete note',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteInfo(entry.id);
        toast('Note deleted', 'ok');
        const sel = infoSelected();
        if (sel) await loadInfo(sel.scope, sel.scopeId, currentEnv());
        await refreshInfoCounts();
        mountContent();
      } catch (err) {
        toast(err.message, 'err');
      }
    })
  );
  document.querySelectorAll('[data-info-pin]').forEach((b) =>
    b.addEventListener('click', async () => {
      const entry = state.info.find((e) => Number(e.id) === Number(b.dataset.infoPin));
      if (!entry) return;
      try {
        await api.updateInfo(entry.id, { pinned: !entry.pinned });
        const sel = infoSelected();
        if (sel) await loadInfo(sel.scope, sel.scopeId, currentEnv());
        await refreshInfoCounts();
        mountContent();
      } catch (err) {
        toast(err.message, 'err');
      }
    })
  );
  const searchInput = document.getElementById('info-search');
  if (searchInput) {
    let timer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      const q = searchInput.value.trim();
      timer = setTimeout(() => runInfoSearch(q), 240);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        runInfoSearch('');
      }
    });
  }

  const clearBtn = document.querySelector('[data-info-clear]');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const input = document.getElementById('info-search');
      if (input) input.value = '';
      runInfoSearch('');
      input?.focus();
    });
  }

  document.querySelectorAll('[data-info-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const entry = state.info.find((e) => Number(e.id) === Number(b.dataset.infoCopy));
      if (!entry) return;
      // A table has no body to copy, so serialise it as tab-separated text — which
      // pastes straight back into a spreadsheet or another grid note.
      const text =
        entry.kind === 'table'
          ? [entry.table?.columns || [], ...(entry.table?.rows || [])]
              .map((r) => r.join('\t'))
              .join('\n')
          : entry.body;
      try {
        await navigator.clipboard.writeText(text);
        toast(entry.kind === 'table' ? 'Table copied as text' : 'Note copied', 'ok');
      } catch {
        toast('Could not copy — select the text manually', 'err');
      }
    })
  );
}

/* ============================================================
   project form modal
   ============================================================ */
function pentesterPickerHTML(selectedIds = []) {
  const selected = new Set(selectedIds.map(Number));
  const rows = sortPentesters(state.users);
  return `
    <div class="psearch">
      ${icon.search()}
      <input class="input" id="p-search" placeholder="Search pentester by name…" autocomplete="off" />
    </div>
    <div class="picker" data-picker>
      ${rows
        .map(
          (u) => `<button type="button" class="pick ${selected.has(u.id) ? 'on' : 'off'}"
            data-uid="${u.id}" data-name="${h(u.name.toLowerCase())}" data-sub="${h(u.subrole || 'Member')}">
            ${avatar(u.name)}
            <span class="pick-name">${h(u.name)}</span>
            ${subroleBadge(u.subrole)}
            ${selected.has(u.id) ? `<span data-check>${icon.check()}</span>` : ''}
          </button>`
        )
        .join('')}
    </div>
    <div class="picker-empty" hidden>${icon.search()} No pentester matches that name.</div>`;
}

/**
 * Multi-select of supervisors, used by the client form.
 * Mirrors the pentester picker markup so bindPicker/pickerValues work unchanged.
 */
function supervisorPickerHTML(selectedIds = []) {
  const selected = new Set(selectedIds.map(Number));
  const rows = state.supervisors || [];
  if (!rows.length) {
    return `<p class="picker-note">Nobody can be named supervisor yet. Add a project manager (or a pentester) under Admin panel → Manage users.</p>`;
  }
  return `
    <div class="psearch">
      ${icon.search()}
      <input class="input" id="p-search" placeholder="Search supervisor by name…" autocomplete="off" />
    </div>
    <div class="picker" data-picker>
      ${rows
        .map(
          (u) => `<button type="button" class="pick ${selected.has(Number(u.id)) ? 'on' : 'off'}"
            data-uid="${u.id}" data-name="${h(u.name.toLowerCase())}"
            data-sub="${h(u.role === PM_ROLE ? 'Project Manager' : 'Pentester')}">
            ${avatar(u.name)}
            <span class="pick-name">${h(u.name)}</span>
            <span class="pick-role">${h(u.role === PM_ROLE ? 'PM' : 'PT')}</span>
            ${selected.has(Number(u.id)) ? `<span data-check>${icon.check()}</span>` : ''}
          </button>`
        )
        .join('')}
    </div>
    <div class="picker-empty" hidden>${icon.search()} No supervisor matches that name.</div>`;
}

function bindPicker(root) {
  const picker = root.querySelector('[data-picker]');
  if (!picker) return;

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.pick');
    if (!btn) return;
    const on = btn.classList.toggle('on');
    btn.classList.toggle('off', !on);
    if (on) {
      if (!btn.querySelector('[data-check]')) {
        const span = document.createElement('span');
        span.dataset.check = '1';
        span.innerHTML = icon.check();
        btn.appendChild(span);
      }
    } else {
      btn.querySelector('[data-check]')?.remove();
    }
  });

  // Name search filters the list in place; selection survives because the
  // buttons are hidden rather than re-rendered.
  const search = root.querySelector('#p-search');
  const empty = root.querySelector('.picker-empty');
  search?.addEventListener('input', () => {
    const needle = search.value.trim().toLowerCase();
    let shown = 0;
    picker.querySelectorAll('.pick').forEach((btn) => {
      const hit = !needle || btn.dataset.name.includes(needle);
      btn.hidden = !hit;
      if (hit) shown += 1;
    });
    if (empty) empty.hidden = shown > 0;
  });
}

function pickerValues(root) {
  return [...root.querySelectorAll('.pick.on')].map((b) => Number(b.dataset.uid));
}

/**
 * Pre-select the supervisor when a client is chosen.
 *
 * A client names one or more usual SVs. With exactly one, that is
 * unambiguous and gets selected. With several, the first is used and the hint
 * says so — silently picking one of many without telling the user would look
 * like a bug. Never touches a SV the user already chose by hand.
 */
function autoPickSupervisor(modal, clientId, hintEl) {
  const box = modal.querySelector('[data-combo="p-supervisor"]');
  if (!box) return;
  const client = clientById(clientId);
  const supervisors = client?.supervisors || [];
  const idInput = box.querySelector('input[type="hidden"], #p-supervisor');
  const current = idInput ? idInput.value : '';

  if (!supervisors.length) {
    if (hintEl) {
      hintEl.innerHTML = client
        ? `${h(client.name)} has no default supervisor yet. Pick one manually or add it in the Admin panel.`
        : 'Owns this engagement. Admins, leads and sub leads can change it.';
      hintEl.classList.toggle('hint-warn', Boolean(client));
    }
    return;
  }

  // Respect a manual choice made earlier in this same form session.
  if (current && current !== String(box.dataset.autoPicked || '')) return;

  const chosen = supervisors[0];
  setComboboxValue(modal, 'p-supervisor', chosen.id);
  box.dataset.autoPicked = String(chosen.id);
  if (hintEl) {
    // One default SV is a fact, so the hint stays quiet. Several is a choice,
    // so it turns into a warning box the user cannot skim past.
    hintEl.innerHTML =
      supervisors.length === 1
        ? `${icon.userCheck(12)} Auto-selected: ${h(chosen.name)} is ${h(client.name)}'s supervisor.`
        : `${icon.alert(12)} Auto-selected ${h(chosen.name)} — ${h(client.name)} has ${supervisors.length} default SVs, change if needed.`;
    hintEl.classList.toggle('hint-warn', supervisors.length > 1);
    hintEl.classList.toggle('hint-auto', supervisors.length === 1);
  }
}

/* ============================================================
   person card — opened by clicking a SV or a pentester avatar
   ============================================================ */
/**
 * Renders one person: contacts, current status, the projects they manage and
 * the ones they test. Opened from any avatar that carries `data-person`, so the
 * same card is reachable from the project table, the card grid and the board.
 */
async function openPerson(id, opts = {}) {
  const { close, modal } = openModal({
    title: 'Loading…',
    body: `<div class="person-loading"><span class="loading-line"></span></div>`,
    wide: true,
  });
  let data;
  try {
    data = await api.person(id);
  } catch (err) {
    toast(err.message || 'Could not load that person', 'danger');
    close();
    return;
  }

  const box = modal;
  box.querySelector('.modal-head h2').textContent = data.person.name;
  box.querySelector('.modal-body').innerHTML = personCardHTML(data, { compact: Boolean(opts.compact) });
  // Project chips open the project itself, replacing the person card so you are
  // never two overlapping dialogs deep.
  box.querySelectorAll('[data-person-open]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
      openProject(Number(btn.dataset.personOpen));
    });
  });
  if (opts.onDone) opts.onDone(close);
}

function variantSelectOptions(applicationId, selectedId = '') {
  const items = variantItems(applicationId);
  const chosen = String(selectedId ?? '');
  // "Whole application" is a real choice, not a placeholder: a sub app is optional.
  return (
    `<option value="">Whole application</option>` +
    items
      .map(
        (i) =>
          `<option value="${i.value}" ${String(i.value) === chosen ? 'selected' : ''}>${h(i.label)}</option>`
      )
      .join('')
  );
}

/**
 * The line under the sub-app picker: only that sub app's own note, if it has one.
 * No sub app chosen, no note written — no line at all.
 */
function variantDetailHTML(applicationId, variantId) {
  const variant = findVariant(variantId);
  if (!variant || !variant.notes) return '';
  return `${h(variant.name)} — ${h(variant.notes)}`;
}

function openProjectForm(project = null) {
  const editing = Boolean(project);
  const isMobile = (project?.category || 'Web') === 'Mobile';
  const variantHintHTML = variantDetailHTML(project?.applicationId, project?.variantId);
  const body = `
    <div class="field">
      <label for="p-name">Project name <span class="required">*</span></label>
      <input class="input" id="p-name" placeholder="e.g. Core Banking Web Portal" value="${h(project?.name || '')}" />
    </div>

    <div class="form-row">
      <div class="field">
        <label for="p-client">Client <span class="required">*</span></label>
        ${combobox({
          id: 'p-client',
          items: clientItems(),
          value: project?.clientId ?? '',
          placeholder: 'Select a client…',
          searchPlaceholder: 'Search client…',
        })}
      </div>
      <div class="field">
        <label for="p-app">Application <span class="required">*</span></label>
        ${combobox({
          id: 'p-app',
          items: applicationItems(project?.clientId),
          value: project?.applicationId ?? '',
          placeholder: project?.clientId ? 'Select an application…' : 'Select a client first',
          searchPlaceholder: 'Search application…',
        })}
      </div>
    </div>
    <!--
      Sub apps are optional. The field only shows up when the chosen application
      HAS sub apps, so a team that never splits an application into products never
      sees an extra question.
    -->
    <div class="field" id="variant-field" ${variantItems(project?.applicationId).length ? '' : 'hidden'}>
      <label for="p-variant">Sub app <span class="opt">optional</span></label>
      <select class="select" id="p-variant">
        ${variantSelectOptions(project?.applicationId, project?.variantId)}
      </select>
      <span class="hint" id="p-variant-hint" ${variantHintHTML ? '' : 'hidden'}>${variantHintHTML}</span>
    </div>

    <!--
      One supervisor per project. Picking a client auto-fills the SVs that
      client names as its usual owners, but the value stays editable: a client
      can have several default SVs and this single slot must still be a choice.
    -->
    <div class="field" style="margin-top:14px">
      <label for="p-supervisor">Supervisor</label>
      ${combobox({
        id: 'p-supervisor',
        items: supervisorItems(),
        value: project?.supervisorId ?? '',
        placeholder: supervisorItems().length ? 'Select a supervisor…' : 'No supervisors yet',
        searchPlaceholder: 'Search supervisor…',
      })}
      <span class="hint" id="p-supervisor-hint">Owns this engagement. Admins, leads and sub leads can change it.</span>
    </div>

    <div class="field" style="margin-top:14px">
      <div class="field-label">Category</div>
      ${segmented('category', propOptions('category'), project?.category || 'Web')}
    </div>

    <div class="field" id="platform-row" ${isMobile ? '' : 'hidden'}>
      <div class="field-label">Mobile platform</div>
      ${segmented('platform', ENUMS.platform, project?.platform || 'Android')}
      <div class="hint">Choose <strong>API</strong> when the mobile app's backend service is the target.</div>
    </div>

    <div class="form-row">
      <div class="field">
        <div class="field-label">Environment</div>
        ${segmented('env', ENUMS.env, project?.env || 'Dev')}
      </div>
      <div class="field">
        <div class="field-label">Testing method</div>
        ${segmented('method', ENUMS.method, project?.method || 'Grey Box', METHOD_TONE)}
      </div>
    </div>

    <!--
      Status gets a full row: it has four options, and squeezing it into a
      half-width column wrapped "Hold" onto a line by itself.
    -->
    <div class="field">
      <div class="field-label">Status</div>
      ${segmented('status', propOptions('status'), project?.status || 'Incoming', statusTones())}
    </div>

    <div class="field">
      <div class="field-label">Who pentest</div>
      ${pentesterPickerHTML((project?.pentesters || []).map((p) => p.id))}
      <span class="hint">Hierarchy: Lead → Sub Lead → Member. Select one or more pentesters.</span>
    </div>

    ${
      editing
        ? `<div class="form-row">
             <div class="field">
               <label for="p-started">Start date</label>
               <input class="input" id="p-started" type="date" value="${h((project?.startedAt || '').slice(0, 10))}" />
               <span class="form-hint">Auto-set on Ongoing. Editable.</span>
             </div>
             <div class="field">
               <label for="p-ended">End date</label>
               <input class="input" id="p-ended" type="date" value="${h((project?.endedAt || '').slice(0, 10))}" />
               <span class="form-hint">Auto-set on Done.</span>
             </div>
           </div>`
        : ''
    }

    <div class="field">
      <label for="p-notes">Notes</label>
      <textarea class="textarea" id="p-notes" rows="4"
        placeholder="Scope, credentials location, out-of-scope items…">${h(project?.notes || '')}</textarea>
    </div>`;

  openModal({
    title: editing ? 'Edit project' : 'New project',
    subtitle: editing ? 'Update engagement details' : 'Create a pentest engagement',
    // Deep-link from the drawer's "Pentester" quick action straight to the team
    // search box.
    initialFocus: '',
    body,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Create project'}</button>`,
    onMount: (modal, close, signal) => {
      const platformRow = modal.querySelector('#platform-row');
      ['env', 'status', 'method', 'platform'].forEach((n) => bindSegmented(modal, n));
      bindSegmented(modal, 'category', (value) => {
        platformRow.hidden = value !== 'Mobile';
      });

      // Client selection refreshes the application list. Only applications
      // belonging to the chosen client are offered, so the pairing can never
      // be inconsistent. Both fields are searchable.
      const appBox = modal.querySelector('[data-combo="p-app"]');
      const pmHint = modal.querySelector('#p-supervisor-hint');
      const variantField = modal.querySelector('#variant-field');
      const variantSelect = modal.querySelector('#p-variant');
      const variantHint = modal.querySelector('#p-variant-hint');
      // The hint only ever carries the chosen sub app's own note, so an empty
      // result hides the line instead of printing a sentence about nothing.
      const setVariantHint = (html) => {
        if (!variantHint) return;
        variantHint.innerHTML = html;
        variantHint.hidden = !html;
      };
      variantSelect?.addEventListener('change', () => {
        setVariantHint(variantDetailHTML(null, variantSelect.value));
      });
      // A variant belongs to exactly one application, so switching the
      // application must never carry the old variant over.
      const syncVariants = (applicationId, keep = '') => {
        if (!variantField || !variantSelect) return;
        const items = variantItems(applicationId);
        variantSelect.innerHTML = variantSelectOptions(applicationId, keep);
        variantField.hidden = items.length === 0;
        if (!keep) setVariantHint('');
      };
      setComboboxItems(modal, 'p-app', applicationItems(project?.clientId), project?.applicationId ?? '');
      syncVariants(project?.applicationId, project?.variantId ?? '');
      bindCombobox(modal, 'p-supervisor', undefined, signal);
      bindCombobox(modal, 'p-client', (value) => {
        if (appBox) appBox.dataset.placeholder = 'Select an application…';
        setComboboxItems(modal, 'p-app', applicationItems(value), '');
        syncVariants(null);
        // Auto-pick this client's usual SV. Only on create: editing an existing
        // project must never silently reassign ownership just because the
        // client was touched.
        if (!editing) autoPickSupervisor(modal, value, pmHint);
      }, signal);
      bindCombobox(modal, 'p-app', (value) => syncVariants(value), signal);

      bindPicker(modal);
      modal.querySelector('[data-cancel]').addEventListener('click', close);

      const save = async () => {
        const name = modal.querySelector('#p-name').value.trim();
        if (!name) {
          toast('Project name is required', 'err');
          modal.querySelector('#p-name').focus();
          return;
        }
        // The comboboxes keep their chosen id in a hidden input, so validation
        // and payload building stay exactly the same as before.
        const chosenClient = modal.querySelector('#p-client').value;
        const chosenApp = modal.querySelector('#p-app').value;
        if (!chosenClient) {
          toast('Select a client', 'err');
          modal.querySelector('[data-combo="p-client"] .combo-toggle')?.focus();
          return;
        }
        if (!chosenApp) {
          toast('Select an application', 'err');
          modal.querySelector('[data-combo="p-app"] .combo-toggle')?.focus();
          return;
        }
        const category = segmentedValue(modal, 'category');
        const chosenSupervisor = modal.querySelector('#p-supervisor').value;
        const chosenVariant = modal.querySelector('#p-variant')?.value || '';
        const payload = {
          name,
          clientId: Number(chosenClient),
          applicationId: Number(chosenApp),
          variantId: chosenVariant ? Number(chosenVariant) : null,
          supervisorId: chosenSupervisor ? Number(chosenSupervisor) : null,
          category,
          platform: category === 'Mobile' ? segmentedValue(modal, 'platform') : '',
          env: segmentedValue(modal, 'env'),
          status: segmentedValue(modal, 'status'),
          method: segmentedValue(modal, 'method'),
          notes: modal.querySelector('#p-notes').value,
          pentesterIds: pickerValues(modal),
        };
        // Dates are only editable after creation; on create the server leaves
        // them empty and stamps them on the first Ongoing/Done transition.
        if (editing) {
          payload.startedAt = modal.querySelector('#p-started').value;
          payload.endedAt = modal.querySelector('#p-ended').value;
        }
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          if (editing) {
            await api.updateProject(project.id, payload);
            toast('Project updated');
          } else {
            await api.createProject(payload);
            toast('Project created');
          }
          close();
          await refreshAll();
          if (state.drawerProjectId) await renderDrawer(state.drawerProjectId, state.drawerTab, true);
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      };
      modal.querySelector('[data-save]').addEventListener('click', save);
      modal.querySelector('#p-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
      });

    },
  });
}

/* ============================================================
   change password
   ============================================================ */
/**
 * Self-service contact details.
 *
 * Only phone and email are editable: name, role, level and reporting line are set
 * by whoever administers the team, and exposing them here would let anyone
 * promote themselves. The form says so rather than leaving the user wondering why
 * their name is not a field.
 */
function openProfileForm() {
  const u = state.user;
  openModal({
    title: 'Contact details',
    subtitle: 'How teammates reach you. Only you can change these.',
    body: `
      <div class="field" style="margin-top:0">
        <label for="pf-phone">Phone number</label>
        <input class="input" id="pf-phone" type="tel" autocomplete="tel"
               placeholder="+62 812 3456 7890" value="${h(u.phone || '')}" />
      </div>
      <div class="field">
        <label for="pf-email">Email</label>
        <input class="input" id="pf-email" type="email" autocomplete="email"
               placeholder="you@company.com" value="${h(u.email || '')}" />
        <span class="hint">Your email also works as a login name. If a colleague already
          uses the same address, sign in with your username instead.</span>
      </div>
      <div class="field">
        <div class="field-label">Fixed by an admin</div>
        <div class="hint hint-auto" style="display:block">
          ${h(u.name)} · @${h(u.username)} · ${h(u.role)} · ${h(u.subrole || 'Member')}
        </div>
      </div>`,
    footer: `<button class="btn" data-cancel>Cancel</button>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-save>${icon.check()} Save</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      const save = modal.querySelector('[data-save]');
      const submit = async () => {
        save.disabled = true;
        try {
          const res = await api.updateProfile({
            phone: modal.querySelector('#pf-phone').value.trim(),
            email: modal.querySelector('#pf-email').value.trim(),
          });
          state.user = { ...state.user, ...res.user };
          close();
          toast('Contact details saved', 'ok');
        } catch (err) {
          toast(err.message, 'err');
          save.disabled = false;
        }
      };
      save.addEventListener('click', submit);
      modal.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') {
          ev.preventDefault();
          submit();
        }
      });
    },
  });
}

function openPasswordForm() {
  const body = `
    <div class="field" style="margin-top:0">
      <label for="pw-current">Current password</label>
      <div class="pw-wrap">
        <input class="input" id="pw-current" type="password" autocomplete="current-password"
               placeholder="Your password right now" />
        <button class="pw-toggle" type="button" data-pw-eye="pw-current"
                aria-label="Show password" title="Show password">${icon.eye(16)}</button>
      </div>
    </div>

    <div class="field">
      <label for="pw-new">New password</label>
      <div class="pw-wrap">
        <input class="input" id="pw-new" type="password" autocomplete="new-password"
               placeholder="At least 6 characters" />
        <button class="pw-toggle" type="button" data-pw-eye="pw-new"
                aria-label="Show password" title="Show password">${icon.eye(16)}</button>
      </div>
      <div class="pw-meter" id="pw-meter" aria-hidden="true"><span></span><span></span><span></span></div>
      <span class="hint" id="pw-hint">Use 6+ characters. A longer passphrase beats a short complex one.</span>
    </div>

    <div class="field">
      <label for="pw-confirm">Confirm new password</label>
      <div class="pw-wrap">
        <input class="input" id="pw-confirm" type="password" autocomplete="new-password"
               placeholder="Type the new password again" />
        <button class="pw-toggle" type="button" data-pw-eye="pw-confirm"
                aria-label="Show password" title="Show password">${icon.eye(16)}</button>
      </div>
      <span class="hint hint-err" id="pw-confirm-hint" hidden>Both new passwords must match.</span>
    </div>

    <p class="hint" style="margin-top:2px">${icon.lock(13)} Changing your password signs out every other device.</p>`;

  openModal({
    title: 'Change password',
    subtitle: `@${state.user.username}`,
    initialFocus: '#pw-current',
    body,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>Update password</button>`,
    onMount: (modal, close) => {
      const cur = modal.querySelector('#pw-current');
      const next = modal.querySelector('#pw-new');
      const conf = modal.querySelector('#pw-confirm');
      const meter = modal.querySelector('#pw-meter');
      const hint = modal.querySelector('#pw-hint');
      const confHint = modal.querySelector('#pw-confirm-hint');
      const save = modal.querySelector('[data-save]');

      // Reveal/hide, so a long passphrase can be typed without guessing.
      modal.querySelectorAll('[data-pw-eye]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const input = modal.querySelector(`#${btn.dataset.pwEye}`);
          const show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          btn.innerHTML = show ? icon.eyeOff(16) : icon.eye(16);
          btn.title = show ? 'Hide password' : 'Show password';
          btn.setAttribute('aria-label', btn.title);
        })
      );

      // A 3-step length meter. Deliberately no "must contain a symbol" rule:
      // the server only asks for 6+, and lying about the policy in the UI is
      // worse than a simpler policy.
      const strength = (v) => (v.length === 0 ? 0 : v.length < 6 ? 1 : v.length < 10 ? 2 : 3);
      const paint = () => {
        const lvl = strength(next.value);
        meter.dataset.level = String(lvl);
        if (lvl === 0) hint.textContent = 'Use 6+ characters. A longer passphrase beats a short complex one.';
        else if (lvl === 1) hint.textContent = 'Too short — at least 6 characters.';
        else if (lvl === 2) hint.textContent = 'Acceptable. A few more characters would be stronger.';
        else hint.textContent = 'Good length.';
        hint.classList.toggle('hint-err', lvl === 1);
        const mismatch = conf.value.length > 0 && conf.value !== next.value;
        confHint.hidden = !mismatch;
        save.disabled = !currentOk();
      };

      const currentOk = () =>
        cur.value.length > 0 && next.value.length >= 6 && conf.value === next.value;

      [cur, next, conf].forEach((i) => i.addEventListener('input', paint));
      paint();

      modal.querySelector('[data-cancel]').addEventListener('click', close);

      const submit = async () => {
        if (!currentOk()) {
          if (conf.value !== next.value) confHint.hidden = false;
          else if (next.value.length < 6) (next.focus(), paint());
          else cur.focus();
          return;
        }
        save.disabled = true;
        try {
          await api.changePassword(cur.value, next.value);
          close();
          toast('Password updated — other devices were signed out');
        } catch (err) {
          // The server's message says exactly what is wrong; surface it rather
          // than a generic "could not save".
          toast(err.message, 'err');
          save.disabled = false;
          cur.select();
        }
      };
      save.addEventListener('click', submit);
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      });
    },
  });
}

/* ============================================================
   focused sub-forms
   ------------------------------------------------------------
   The quick "+" in the Pentesters column and the "Edit notes" button used to
   dump the whole project form on the user for a one-field change. These two
   modals show exactly the field being changed and PATCH only that field.
   ============================================================ */

function openTeamForm(project) {
  const body = `
    <div class="field" style="margin-top:0">
      <div class="field-label">Who pentest</div>
      ${pentesterPickerHTML((project.pentesters || []).map((p) => p.id))}
      <span class="hint">Hierarchy: Lead → Sub Lead → Member. Select one or more pentesters.</span>
    </div>`;

  openModal({
    title: 'Who pentest',
    subtitle: project.name,
    initialFocus: '#p-search',
    body,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>Save pentesters</button>`,
    onMount: (modal, close) => {
      bindPicker(modal);
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      const save = async () => {
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          // Only pentesterIds is sent: a PATCH without the other keys leaves
          // every other column exactly as it was.
          await api.updateProject(project.id, { pentesterIds: pickerValues(modal) });
          toast('Pentesters updated');
          close();
          await refreshAll();
          if (state.drawerProjectId) await renderDrawer(state.drawerProjectId, state.drawerTab, true);
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      };
      modal.querySelector('[data-save]').addEventListener('click', save);
    },
  });
}

function openNotesForm(project) {
  const body = `
    <div class="field" style="margin-top:0">
      <label for="n-notes">Notes</label>
      <textarea class="textarea" id="n-notes" rows="7"
        placeholder="Scope, credentials location, out-of-scope items…">${h(project.notes || '')}</textarea>
      <span class="hint">Only the notes are changed — name, client, SV and status stay as they are.</span>
    </div>`;

  openModal({
    title: project.notes ? 'Edit notes' : 'Add notes',
    subtitle: project.name,
    initialFocus: '#n-notes',
    body,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>Save notes</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      const save = async () => {
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          await api.updateProject(project.id, { notes: modal.querySelector('#n-notes').value });
          toast('Notes saved');
          close();
          await refreshAll();
          if (state.drawerProjectId) await renderDrawer(state.drawerProjectId, state.drawerTab, true);
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      };
      modal.querySelector('[data-save]').addEventListener('click', save);
    },
  });
}

/* ============================================================
   retest form modal
   ============================================================ */
function openRetestForm(projectId, retest = null, onDone) {
  const editing = Boolean(retest);
  // The retest carries no free-text title any more: it is simply a queued
  // re-verification of THIS project, so it is named after the project. Only the
  // request date, queue status and notes are captured. requested_by is retired
  // for the same reason — the actor is recorded server-side.
  const body = `
    <div class="callout">
      ${icon.queue()}
      <div>
        <strong>A retest is a client request</strong>
        <span>Re-verifies this project. Not a new pentest, and not tied to one finding.</span>
      </div>
    </div>

    <div class="field">
      <label for="r-date">Request date</label>
      <input class="input" id="r-date" type="date" value="${h(retest?.requestedAt || todayISO())}" />
      <span class="hint">When the client asked for this retest.</span>
    </div>

    ${
      editing
        ? `<div class="form-row">
             <div class="field">
               <label for="r-started">Start date</label>
               <input class="input" id="r-started" type="date" value="${h((retest?.startedAt || '').slice(0, 10))}" />
               <span class="form-hint">Auto-set on Ongoing.</span>
             </div>
             <div class="field">
               <label for="r-ended">End date</label>
               <input class="input" id="r-ended" type="date" value="${h((retest?.endedAt || '').slice(0, 10))}" />
               <span class="form-hint">Auto-set on Done.</span>
             </div>
           </div>`
        : ''
    }

    <div class="field">
      <div class="field-label">Queue status</div>
      ${segmented('status', propOptions('status'), retest?.status || 'Incoming', statusTones())}
      <span class="hint">Incoming or Ongoing keeps the project in the retest queue.</span>
    </div>

    <div class="field">
      <label for="r-notes">Notes</label>
      <textarea class="textarea" id="r-notes" rows="3"
        placeholder="Retest window, environment, scope…">${h(retest?.notes || '')}</textarea>
    </div>`;

  openModal({
    title: editing ? 'Edit retest request' : 'New retest request',
    subtitle: editing
      ? retest.code
      : 'Adds a request to the retest queue — the project keeps its own status',
    body,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Add to queue'}</button>`,
    onMount: (modal, close) => {
      bindSegmented(modal, 'status');
      modal.querySelector('[data-cancel]').addEventListener('click', close);

      const save = async () => {
        const payload = {
          requestedAt: modal.querySelector('#r-date').value,
          status: segmentedValue(modal, 'status'),
          notes: modal.querySelector('#r-notes').value,
        };
        // Retest dates work exactly like project dates: never asked on create,
        // auto-stamped on the Ongoing/Done transition, editable afterwards.
        if (editing) {
          payload.startedAt = modal.querySelector('#r-started').value;
          payload.endedAt = modal.querySelector('#r-ended').value;
        }
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          if (editing) {
            await api.updateRetest(retest.id, payload);
            toast('Retest request updated');
          } else {
            await api.createRetest(projectId, payload);
            toast('Added to the retest queue');
          }
          close();
          await refreshAll();
          await renderDrawer(projectId, 'retests', true);
          onDone?.();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      };
      modal.querySelector('[data-save]').addEventListener('click', save);
    },
  });
}

/* ============================================================
   project drawer
   ============================================================ */
function closeDrawer() {
  document.querySelectorAll('.drawer, .drawer-backdrop').forEach((el) => el.remove());
  state.drawerProjectId = null;
  state.drawer = null;
  document.removeEventListener('keydown', drawerKeyHandler);
}

function drawerKeyHandler(e) {
  if (e.key === 'Escape' && document.querySelector('.modal-backdrop') === null) closeDrawer();
}

async function openProject(id, tab = 'overview') {
  state.drawerProjectId = id;
  state.drawerTab = tab;
  await renderDrawer(id, tab, false);
}

async function renderDrawer(id, tab = 'overview', keepOpen = true) {
  // Remember where the user is. Tab switches call renderDrawer directly, so
  // without this any later refresh (saving notes, adding a pentester) would
  // silently snap the drawer back to Overview.
  state.drawerProjectId = id;
  state.drawerTab = tab;
  let data;
  try {
    data = await api.project(id);
  } catch (err) {
    toast(err.message, 'err');
    return;
  }
  document.querySelector('.drawer-backdrop')?.remove();
  document.querySelector('.drawer')?.remove();

  const { project, retests } = data;
  const backdrop = document.createElement('div');
  backdrop.className = 'drawer-backdrop';
  backdrop.addEventListener('click', closeDrawer);

  const el = document.createElement('aside');
  el.className = 'drawer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = drawerHTML(project, retests, tab);

  document.body.appendChild(backdrop);
  document.body.appendChild(el);
  if (!keepOpen) document.addEventListener('keydown', drawerKeyHandler);
  bindDrawer(el, project, retests);
}

function drawerHTML(project, retests, tab) {
  const cat = CATEGORY[project.category] || { color: 'var(--slate)', soft: 'var(--slate-soft)' };
  const openRetests = retests.filter((r) => r.status === 'Incoming' || r.status === 'Ongoing').length;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'retests', label: 'Retests', count: retests.length },
    { id: 'notes', label: 'Notes' },
  ];

  return `
    <div class="drawer-head">
      <div class="row">
        <div class="cat-icon" style="--cat-color:${cat.color};--cat-soft:${cat.soft};width:38px;height:38px;border-radius:11px;background:${cat.soft};color:${cat.color};display:grid;place-items:center">
          ${catIcon(project.category, 18)}
        </div>
        <h2>${h(project.name)}</h2>
        <div class="actions">
          <button class="btn btn-icon" data-edit aria-label="Edit project" title="Edit project">${icon.edit()}</button>
          ${
            // The server refuses with 403 anyway; not offering the button means a
            // Member never sees a control that only exists to say no.
            canManageCatalog()
              ? `<button class="btn btn-icon btn-icon-danger" data-delete-project aria-label="Delete project" title="Delete project">${icon.trash()}</button>`
              : ''
          }
          <button class="btn btn-icon" data-close-drawer aria-label="Close">${icon.x()}</button>
        </div>
      </div>
      <div class="meta">
        ${quickStatus(project.status, project.id)}
        ${catBadge(project.category, project.platform)}
        ${envBadge(project.env)}
        ${methodBadge(project.method)}
        ${openRetests ? `<span class="badge pulse" data-tone="cyan"><span class="dot"></span>${openRetests} open retest${openRetests > 1 ? 's' : ''}</span>` : ''}
      </div>
      <div class="drawer-client">
        ${icon.building(14)}
        <span>${h(project.client || 'No client')}${
          project.applicationName ? ` &ndash; ${h(project.applicationName)}` : ''
        }${project.variantName ? ` &ndash; ${h(project.variantName)}` : ''}</span>
      </div>
      <div class="tabs">
        ${tabs
          .map(
            (t) => `<button class="tab ${t.id === tab ? 'active' : ''}" data-tab="${t.id}">
              ${t.label}${t.count !== undefined ? `<span class="n">${t.count}</span>` : ''}
            </button>`
          )
          .join('')}
      </div>
    </div>
    <div class="drawer-body">${tabBody(project, retests, tab)}</div>
    ${
      tab === 'retests'
        ? `<div class="drawer-foot">
             <span style="font-size:12px;color:var(--muted)">${retests.length} client request${retests.length === 1 ? '' : 's'}</span>
             <div class="spacer"></div>
             <button class="btn btn-primary" data-add-retest>${icon.plus()} New retest</button>
           </div>`
        : `<div class="drawer-foot">
             <span style="font-size:12px;color:var(--faint)">Updated ${fmtRelative(project.updatedAt)}</span>
             <div class="spacer"></div>
             <button class="btn" data-edit>${icon.edit()} Edit</button>
           </div>`
    }`;
}

function tabBody(project, retests, tab) {
  if (tab === 'overview') {
    const team = project.pentesters || [];
    const bySubrole = ENUMS.subrole.map((s) => ({ subrole: s, people: team.filter((p) => (p.subrole || 'Member') === s) }));
    const open = retests.filter((r) => r.status === 'Incoming' || r.status === 'Ongoing').length;

    return `
      ${
        open
          ? `<div class="callout queue">
               ${icon.queue()}
               <div>
                 <strong>In the retest queue</strong>
                 <span>${open} open client request${open === 1 ? '' : 's'}. Open the Retests tab to work through ${open === 1 ? 'it' : 'them'}.</span>
               </div>
             </div>`
          : ''
      }

      <div class="info-grid">
        <div class="info-item span-2"><div class="k">Client</div><div class="v">${h(project.client || '—')}</div></div>
        <div class="info-item span-2"><div class="k">Application</div><div class="v">${h(project.applicationName || '—')}</div></div>
        ${
          project.variantName
            ? `<div class="info-item span-2"><div class="k">Sub app</div><div class="v">${h(
                project.variantName
              )}</div></div>`
            : ''
        }
        <div class="info-item span-2">
          <div class="k">Supervisor</div>
          <div class="v">${
            project.supervisorName
              ? `${h(project.supervisorName)}${
                  project.supervisorEmail
                    ? `<div class="v-sub">${contactLine(project.supervisorPhone, project.supervisorEmail)}</div>`
                    : ''
                }`
              : '<span class="dash">—</span>'
          }</div>
        </div>
        <div class="info-item"><div class="k">Category</div><div class="v">${h(propLabel('category', project.category))}${
          project.category === 'Mobile' && project.platform ? ` · ${h(project.platform)}` : ''
        }</div></div>
        <div class="info-item"><div class="k">Environment</div><div class="v">${h(project.env)}</div></div>
        <div class="info-item"><div class="k">Method</div><div class="v">${h(project.method)}</div></div>
        <div class="info-item"><div class="k">Status</div><div class="v">${h(propLabel('status', project.status))}</div></div>
        <div class="info-item"><div class="k">Start date</div><div class="v">${project.startedAt ? fmtDate(project.startedAt) : '<span class="dash">—</span>'}</div></div>
        <div class="info-item"><div class="k">End date</div><div class="v">${project.endedAt ? fmtDate(project.endedAt) : '<span class="dash">—</span>'}</div></div>
        <div class="info-item"><div class="k">Created</div><div class="v">${fmtDate(project.createdAt)}</div></div>
        <div class="info-item"><div class="k">Last updated</div><div class="v">${fmtDate(project.updatedAt)}</div></div>
      </div>

      <div style="margin-top:20px">
        <div class="section-head">
          <h3>Pentesters</h3>
          <span class="badge badge-outline">${team.length} assigned</span>
          <span class="spacer"></span>
          <button class="btn btn-sm" data-team-edit title="Assign pentesters">${icon.plus()} Pentester</button>
        </div>
        ${
          team.length
            ? `<div class="team-groups">
                ${bySubrole
                  .filter((g) => g.people.length)
                  .map(
                    (g) => `<div class="team-group">
                      <div class="tg-label">${subroleBadge(g.subrole)}<span>${g.people.length}</span></div>
                      <div class="tg-people">
                        ${g.people.map((p) => `<span class="pick on" style="pointer-events:none">${avatar(p.name)}<span>${h(p.name)}</span></span>`).join('')}
                      </div>
                    </div>`
                  )
                  .join('')}
              </div>`
            : `<p style="font-size:12.5px;color:var(--faint)">No pentester assigned yet.</p>`
        }
      </div>

      <div style="margin-top:20px">
        <div class="section-head"><h3>Retest summary</h3><span class="spacer"></span>
          <button class="btn btn-sm" data-tab-jump="retests">View all ${icon.chevronRight()}</button>
        </div>
        <div class="info-grid">
          <div class="info-item"><div class="k">Total requests</div><div class="v">${retests.length}</div></div>
          <div class="info-item"><div class="k">Open</div><div class="v">${open}</div></div>
        </div>
        ${
          retests.length
            ? `<div class="retest-list" style="margin-top:12px">${retests.slice(0, 2).map(retestHTML).join('')}</div>`
            : ''
        }
      </div>
    </div>`;
  }

  if (tab === 'retests') {
    if (!retests.length) {
      return `<div class="empty" style="border:none;background:transparent">
        <div class="icon">${icon.queue()}</div>
        <h3>No retest requests yet</h3>
        <p>When a client asks you to re-verify the project, log the request here. It is queued until you finish it, and there is no limit on how many a project can have.</p>
        <button class="btn btn-primary" data-add-retest>${icon.plus()} New retest</button>
      </div>`;
    }
    return `<div class="retest-list">${retests.map(retestHTML).join('')}</div>`;
  }

  return project.notes
    ? `<div class="notes-block">${h(project.notes)}</div>
       <div style="margin-top:14px">
         <button class="btn btn-sm" data-edit-notes>${icon.edit()} Edit notes</button>
       </div>`
    : `<div class="empty" style="border:none;background:transparent">
        <div class="icon">${icon.note()}</div>
        <h3>No notes</h3>
        <p>Add scope details, credentials location, or out-of-scope items.</p>
        <button class="btn" data-edit-notes>${icon.edit()} Add notes</button>
      </div>`;
}

function retestHTML(r) {
  const tone = propTone('status', r.status);
  return `
    <div class="retest" style="--st-color:var(--${tone === 'slate' ? 'slate' : tone})" data-retest="${r.id}">
      <div class="retest-top">
        <div class="title">
          <h4>${h(r.title)}</h4>
          <div class="code">${h(r.code)}</div>
        </div>
        ${statusBadge(r.status)}
      </div>
      <div class="retest-foot">
        ${r.requestedAt ? `<span class="who">${icon.calendar()} asked ${fmtDate(r.requestedAt)}</span>` : ''}
        ${r.startedAt ? `<span class="who">${icon.play()} ${fmtDate(r.startedAt)}</span>` : ''}
        ${r.endedAt ? `<span class="who">${icon.check(12)} ${fmtDate(r.endedAt)}</span>` : ''}
        <span class="spacer"></span>
        <button class="btn btn-icon" style="width:26px;height:26px" data-retest-edit="${r.id}" aria-label="Edit retest">${icon.edit()}</button>
        ${canManageCatalog() ? `<button class="btn btn-icon" style="width:26px;height:26px;color:var(--rose)" data-retest-del="${r.id}" aria-label="Delete retest">${icon.trash()}</button>` : ''}
      </div>
      ${r.notes ? `<div style="margin-top:9px;font-size:11.8px;color:var(--faint);border-top:1px dashed var(--border);padding-top:8px">${h(r.notes)}</div>` : ''}
    </div>`;
}

function bindDrawer(el, project, retests) {
  el.querySelector('[data-close-drawer]').addEventListener('click', closeDrawer);

  // Quick status inside the drawer: refresh the drawer AND the list behind it.
  el.querySelectorAll('[data-set-status]').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      hideMenu(item.closest('.quick-status-menu'));
      try {
        await api.updateProject(project.id, { status: item.dataset.setStatus });
        toast(`Status changed to ${item.dataset.setStatus}`);
        await Promise.all([loadStats(), loadProjects()]);
        await renderDrawer(project.id, state.drawerTab, true);
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });
  el.querySelectorAll('[data-quick-toggle]').forEach((toggle) => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = toggle.closest('[data-quick-status]').querySelector('.quick-status-menu');
      const willOpen = menu.hidden;
      el.querySelectorAll('.quick-status-menu').forEach(hideMenu);
      menu.hidden = !willOpen;
      if (willOpen) placeMenu(menu, toggle);
    });
  });

  el.querySelectorAll('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => renderDrawer(project.id, btn.dataset.tab, true))
  );
  el.querySelectorAll('[data-tab-jump]').forEach((btn) =>
    btn.addEventListener('click', () => renderDrawer(project.id, btn.dataset.tabJump, true))
  );
  el.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openProjectForm(project)));
  // Notes have their own tiny modal: opening the whole project form to change
  // one textarea buries the field the user actually asked for.
  el.querySelectorAll('[data-edit-notes]').forEach((btn) =>
    btn.addEventListener('click', () => openNotesForm(project))
  );
  el.querySelectorAll('[data-team-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openTeamForm(project))
  );
  el.querySelectorAll('[data-add-retest]').forEach((btn) =>
    btn.addEventListener('click', () => openRetestForm(project.id, null))
  );

  el.querySelector('[data-delete-project]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete project?',
      message: `"${project.name}" and its ${retests.length} retest request(s) will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete project',
    });
    if (!ok) return;
    try {
      await api.deleteProject(project.id);
      closeDrawer();
      toast('Project deleted');
      await refreshAll();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  el.querySelectorAll('[data-retest-edit]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = retests.find((x) => x.id === Number(btn.dataset.retestEdit));
      if (r) openRetestForm(project.id, r);
    })
  );

  el.querySelectorAll('[data-retest-del]').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const r = retests.find((x) => x.id === Number(btn.dataset.retestDel));
      if (!r) return;
      const ok = await confirmDialog({
        title: 'Delete retest request?',
        message: `"${r.title}" (${r.code}) will be removed from the queue.`,
        confirmLabel: 'Delete request',
      });
      if (!ok) return;
      try {
        await api.deleteRetest(r.id);
        toast('Retest request deleted');
        await refreshAll();
        await renderDrawer(project.id, 'retests', true);
      } catch (err) {
        toast(err.message, 'err');
      }
    })
  );
}


/* ============================================================
   Staff directory (Workspace → Users)
   ------------------------------------------------------------
   The read-only answer to "who works here": every account, one row
   each, with the role and the two contact details the team actually
   uses. It is deliberately a table and not the admin tree — looking a
   person up is a lookup, and hierarchy is the wrong shape for that.
   Management (create, import, move in the tree) stays in the Admin
   panel, one page over.
   ============================================================ */
/**
 * Who the directory is FOR: people you might need to ask something.
 *
 * Admin accounts are excluded on purpose. An administrator is operations — they
 * appear in Manage users, and listing them here invites a tester to ask the wrong
 * person about a retest.
 */
const DIRECTORY_GROUPS = [
  {
    role: 'Project Manager',
    label: 'Project managers',
    note: 'Own the engagement and the client relationship',
  },
  {
    role: 'Pentester',
    label: 'Pentesters',
    note: 'Do the testing',
  },
];

function directoryPeople() {
  return (state.directory || []).filter((u) => u.role !== 'Admin');
}

function directoryHTML() {
  const all = directoryPeople();
  const q = (state.dirQuery || '').trim();
  const rows = directoryMatches(all, q);

  return `<div class="dir-page">
    <div class="dev-head">
      <div>
        <h2>Users</h2>
        <p class="dev-sub">${all.length} ${all.length === 1 ? 'person' : 'people'} you can ask —
          supervisors and pentesters</p>
      </div>
    </div>
    <div class="dev-bar">
      <div class="search dev-search">
        ${icon.search()}
        <input class="input" id="dir-search" placeholder="Search name, role, e-mail or phone…"
          autocomplete="off" aria-label="Search users" value="${h(q)}" />
        <button class="btn btn-sm dev-clear" data-dir-clear ${q ? '' : 'hidden'}>Clear</button>
      </div>
    </div>
    <div id="dir-results">${directoryGroupsHTML(rows, q)}</div>
  </div>`;
}

/**
 * The two groups, in that order, each with its own count.
 *
 * One alphabetical table answered "who is this?" but not "who do I ask about the
 * project" — the role was a column you had to read past. A group per role makes the
 * answer a heading. Groups with no matches disappear, so a search for a supervisor
 * leaves one section rather than an empty one.
 */
function directoryGroupsHTML(rows, q) {
  if (!rows.length) return directoryTableHTML(rows, q); // renders the empty state
  return DIRECTORY_GROUPS.map((group) => {
    const list = rows.filter((u) => u.role === group.role);
    if (!list.length) return '';
    return `<section class="dir-group">
      <div class="dir-group-head">
        <h3>${h(group.label)}<span class="dir-count">${list.length}</span></h3>
        <p>${h(group.note)}</p>
      </div>
      ${directoryTableHTML(list)}
    </section>`;
  }).join('');
}

/** Phone numbers, normalized so the country code does not decide the result. */
function digitsOnly(value) {
  return String(value || '')
    .replace(/[^\d]/g, '')
    // +62 812 … and 0812 … are the same phone to everyone except a string compare.
    .replace(/^62/, '0');
}

/**
 * Every column of a person, so one search box answers every way of asking.
 *
 * The phone is also matched on digits alone: a number read off a screen as
 * "+62 812 1000 0005" is typed back as "0812 1000 0005", and a plain substring test
 * found nothing.
 */
function directoryMatches(list, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return list;
  const digits = digitsOnly(needle);
  return list.filter((u) => {
    if (
      [u.name, u.role, u.subrole, u.email, u.phone, u.username]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    ) {
      return true;
    }
    return digits.length >= 4 && digitsOnly(u.phone).includes(digits);
  });
}

/**
 * The role column: the ROLE, plus the pentest level when the account has one.
 *
 * A lead and a member are both "Pentester", and which one they are is the thing you
 * need before you ask them for anything — so the level rides along as a chip rather
 * than being a fifth column nobody asked for.
 */
function directoryRoleHTML(person) {
  const role =
    person.role === 'Project Manager'
      ? 'Project Manager'
      : person.role === 'Admin'
        ? 'Admin'
        : 'Pentester';
  const level = person.role === 'Project Manager' ? '' : person.subrole;
  return `<span class="dir-role"><span class="dir-role-name">${h(role)}</span>${
    level ? subroleBadge(level) : ''
  }</span>`;
}

function directoryTableHTML(rows, q) {
  if (!rows.length) {
    return `<div class="empty">
        <div class="icon">${icon.users(26)}</div>
        <h3>${q ? `No one matches “${h(q)}”` : 'Nobody here yet'}</h3>
        <p>${
          q
            ? 'The search looks at the name, role, e-mail and phone number.'
            : 'Accounts are created in the Admin panel, under Manage users.'
        }</p>
      </div>`;
  }

  return `<div class="dev-tablewrap" data-dir-scroll>
      <span class="dev-scrollfx left" aria-hidden="true"></span>
      <span class="dev-scrollfx right" aria-hidden="true"></span>
      <table class="dev-table">
        <thead><tr>
          <th class="dev-h-name"><span class="dev-h-inner"><span class="dev-h-label">Full name</span></span></th>
          <th class="dev-h-role"><span class="dev-h-inner"><span class="dev-h-label">Role</span></span></th>
          <th class="dev-h-email"><span class="dev-h-inner"><span class="dev-h-label">E-mail</span></span></th>
          <th class="dev-h-phone"><span class="dev-h-inner"><span class="dev-h-label">Number phone</span></span></th>
        </tr></thead>
        <tbody>${rows
          .map(
            (u) => `<tr data-dir-row="${u.id}">
            <td class="dev-name"><span class="dir-person">${avatar(u.name, 'sm', u.id)}<span>${h(u.name)}</span></span></td>
            <td data-label="Role">${directoryRoleHTML(u)}</td>
            <td class="dev-mono-cell" data-label="E-mail">${
              u.email
                ? `<a href="mailto:${h(u.email)}" title="${h(u.email)}">${h(u.email)}</a>`
                : '<span class="dev-empty-cell">—</span>'
            }</td>
            <td class="dev-mono-cell" data-label="Number phone">${
              u.phone
                ? `<a href="tel:${h(String(u.phone).replace(/[^+\d]/g, ''))}" title="${h(u.phone)}">${h(u.phone)}</a>`
                : '<span class="dev-empty-cell">—</span>'
            }</td>
          </tr>`
          )
          .join('')}</tbody>
      </table>
    </div>
    <p class="dev-scrollhint">${icon.chevronRight(12)} Scroll sideways for the remaining columns</p>`;
}

async function loadDirectory() {
  const token = nextLoadToken('directory');
  try {
    const res = await api.directory();
    if (!isCurrentLoad('directory', token)) return;
    state.directory = res.users || [];
  } catch (err) {
    if (!isCurrentLoad('directory', token)) return;
    state.directory = [];
    toast(err.message, 'err');
  }
  if (state.nav === 'directory') mountContent();
}

function bindDirectory() {
  const content = document.getElementById('content');
  if (!content) return;

  const host = content.querySelector('#dir-results');
  const repaint = () => {
    if (!host) return;
    const query = (state.dirQuery || '').trim();
    // Same two groups as the first paint — filtering must not flatten the page back
    // into one table, which is what a call to directoryTableHTML() alone did.
    host.innerHTML = directoryGroupsHTML(directoryMatches(directoryPeople(), query), query);
    const clear = content.querySelector('[data-dir-clear]');
    if (clear) clear.hidden = !query;
    host.querySelectorAll('[data-dir-scroll]').forEach((wrap) => syncTableOverflow(wrap));
  };

  const search = content.querySelector('#dir-search');
  if (search) {
    let t;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.dirQuery = search.value;
        repaint();
      }, 140);
    });
  }
  content.querySelector('[data-dir-clear]')?.addEventListener('click', () => {
    state.dirQuery = '';
    if (search) {
      search.value = '';
      search.focus();
    }
    repaint();
  });

  // Same click-through as every other avatar in the app: the face opens the card.
  // Bound on the page wrapper, which `mountContent` re-creates — a listener on the
  // stable `#content` would stack a new copy on every render.
  content.querySelector('.dir-page')?.addEventListener('click', (ev) => {
    const face = ev.target.closest('[data-person]');
    if (!face) return;
    ev.preventDefault();
    openPerson(Number(face.dataset.person));
  });

  const wrap = content.querySelector('[data-dir-scroll]');
  if (wrap) syncTableOverflow(wrap);
}

/* ============================================================
   Pentesters (admin panel)
   ------------------------------------------------------------
   Three fixed levels: Lead > Sub Lead > Member. `parent_id` in the
   database stores the reporting line; the server validates it, so the
   form only has to offer legal choices.
   ============================================================ */
/* ============================================================
   Team status board
   ------------------------------------------------------------
   One row per pentester, ordered by the reporting tree
   (Lead, Sub Lead, Member, Member, Sub Lead, Member, Member).
   The status is derived on the server unless the pentester set
   a manual one (Leave / Exam / Research / Other).
   ============================================================ */
const AVAIL_STATUSES = ['On Project', 'Idle', 'Leave', 'Exam', 'Research/Learning', 'Other'];
const AVAIL_MANUAL = ['Leave', 'Exam', 'Research/Learning', 'Other'];

/**
 * Who may change a given row. Mirrors canEditAvailability() on the server:
 * Admin / Lead / Sub Lead may edit anybody, a Member only their own row.
 */
function canEditRow(person) {
  if (!state.user) return false;
  if (canManageCatalog()) return true;
  return Number(state.user.id) === Number(person.id);
}

/**
 * Which rows the board shows, given the filter card and the search box.
 *
 * The filter matches the person AND their work: typing "brimo" finds whoever is
 * assigned to the Brimo engagement, because "who is on this client's project" is
 * the question this page exists to answer, and the project name is nowhere else on
 * the row.
 */
function boardMatches(p) {
  const filter = state.boardFilter || '';
  if (filter && p.status !== filter) return false;
  const q = (state.boardQuery || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [
    p.name,
    p.subrole,
    p.status,
    p.availabilityNote,
    ...(p.currentProjects || []).map((pr) => `${pr.name} ${pr.status}`),
    ...(p.currentRetests || []).map((rt) => `retest ${rt.projectName} ${rt.status}`),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

/** Every row that survives the filter and the search — the bench and the interns. */
function boardRows() {
  return (state.board || []).filter(boardMatches);
}

/**
 * The board is two tables, not one: the bench (leads, sub leads, members) and the
 * interns. An intern is a person learning the job, so mixing them into the tree
 * would put a trainee beside the people they are being trained by and make "who is
 * on the bench" answerable only by reading every level pill.
 */
function boardPentesters() {
  return boardRows().filter((r) => r.subrole !== 'Intern');
}

function boardInterns() {
  // Grouped by supervisor, then by name: the table is flat, so the only thing that
  // gives it structure is the "under <who>" line, and that reads as a group only if
  // the people under the same supervisor sit together.
  return boardRows()
    .filter((r) => r.subrole === 'Intern')
    .sort(
      (a, b) =>
        boardNameById(a.parentId).localeCompare(boardNameById(b.parentId)) ||
        String(a.name).localeCompare(String(b.name))
    );
}

/** Names for "under <who>" on an intern row, from the rows we already hold. */
function boardNameById(id) {
  const row = (state.board || []).find((r) => Number(r.id) === Number(id));
  return row ? row.name : '';
}

/**
 * How deep in the reporting tree a row sits: Lead 0, Sub Lead 1, Member 2.
 *
 * The server already returns the board in tree order, so the depth only has to be
 * drawn — a 1px rail and an indent are enough to read "these two report to Dewi"
 * without a group header eating a row.
 */
const BOARD_DEPTH = { Lead: 0, 'Sub Lead': 1, Member: 2 };

function boardChipHTML(kind, pr) {
  const isRetest = kind === 'retest';
  const tone = propTone('status', pr.status, 'slate');
  const label = isRetest ? `Retest - ${pr.projectName}` : pr.name;
  const title = isRetest
    ? `Retest on ${pr.projectName} — ${pr.title || pr.code || 'client request'} · ${pr.status}`
    : `${pr.name} · ${pr.status}`;
  return `<button type="button" class="board-chip${isRetest ? ' board-chip-retest' : ''}"
            data-open-project="${isRetest ? pr.projectId : pr.id}" title="${h(title)}">
       <span class="chip-dot" data-tone="${tone}" aria-hidden="true"></span>
       <span class="chip-name">${h(label)}</span>
       <em>${h(pr.status)}</em>
     </button>`;
}

function boardRowHTML(p, opts = {}) {
  const editable = canEditRow(p);
  const projects = p.currentProjects || [];
  const retests = p.currentRetests || [];
  const depth = BOARD_DEPTH[p.subrole] ?? 2;
  // The full list: a pentester's workload is the point of this column, so nothing
  // is hidden behind a "+N more" counter. The assign affordance is rendered even
  // when the list is empty — an idle pentester is exactly who a supervisor wants to
  // put on something.
  const assignBtn = editable
    ? `<button type="button" class="board-assign" data-assign-open="${p.id}">
         ${icon.plus(11)} Assign project
       </button>`
    : '';
  const anyWork = projects.length + retests.length > 0;
  const projectCell = anyWork
    ? `<div class="board-projects">
         ${projects.map((pr) => boardChipHTML('project', pr)).join('')}
         ${retests.map((rt) => boardChipHTML('retest', rt)).join('')}
         ${assignBtn}
       </div>`
    : `<div class="board-projects">
         <span class="board-muted">Nothing assigned</span>
         ${assignBtn}
       </div>`;

  // `data-label` is what the stacked phone layout uses as its row heading.
  const idleDays = p.status === 'Idle' && p.idleSince ? daysSince(p.idleSince) : null;
  const idleCell =
    idleDays === null
      ? ''
      : `<span class="idle-badge" data-age="${idleDays > 60 ? 'hot' : idleDays > 14 ? 'warn' : 'ok'}">
           ${idleDays}<em>d</em>
         </span>
         <span class="board-muted idle-since">since ${fmtDate(p.idleSince)}</span>`;
  const idleLabel = idleDays === null ? '' : ' data-label="Idle since"';

  const noteCell = editable
    ? `<button type="button" class="board-note${p.availabilityNote ? '' : ' is-empty'}"
         data-avail-note="${p.id}" title="${p.availabilityNote ? 'Edit note' : 'Add a note'}">
         ${
           p.availabilityNote
             ? `<span class="note-text">${h(p.availabilityNote)}</span><span class="note-pen">${icon.edit(12)}</span>`
             : `<span class="note-pen">${icon.edit(12)}</span><span>Add a note…</span>`
         }
       </button>`
    : p.availabilityNote
      ? `<span class="note-text">${h(p.availabilityNote)}</span>`
      : '';

  return `
    <tr class="board-row${opts.interns ? ' is-intern-row' : ''}"${
      opts.interns ? ' data-intern-row' : ''
    } data-board-row="${p.id}" data-status="${h(p.status)}" data-depth="${depth}">
      <td class="cell-person">
        <div class="board-person">
          ${avatar(p.name, 'sm', p.id)}
          <div class="bp-meta">
            <strong data-person="${p.id}" role="button" tabindex="0">${h(p.name)}</strong>
            <span>${subroleBadge(p.subrole)}${
              p.subrole === 'Intern' && boardNameById(p.parentId)
                ? `<em class="bp-under">under ${h(boardNameById(p.parentId))}</em>`
                : ''
            }</span>
          </div>
        </div>
      </td>
      <td class="cell-avail">
        ${
          editable
            ? `<button type="button" class="avail-btn" data-avail-open="${p.id}"
                 data-tone="${AVAILABILITY[p.status]?.tone || 'slate'}"
                 aria-haspopup="menu" aria-label="Set availability for ${h(p.name)}">
                 ${availabilityBadge(p.status, p.automatic)}${icon.chevronDown(12)}
               </button>`
            : availabilityBadge(p.status, p.automatic)
        }
      </td>
      <td class="cell-doing" data-label="Projects &amp; retests">${projectCell}</td>
      <td class="cell-idle"${idleLabel}>${idleCell}</td>
      <td class="cell-note" data-label="Notes">${noteCell}</td>
    </tr>`;
}

/** The table on its own, so a filter change repaints it without touching the
 *  toolbar (which would steal focus from the search box mid-typing). */
/** The empty state for one table, worded for whichever table ran dry. */
function boardEmptyHTML(kind = 'pentesters') {
  const filtered = Boolean(state.boardFilter || (state.boardQuery || '').trim());
  const who = kind === 'interns' ? 'intern' : 'pentester';
  return `<div class="board-empty">
      <div class="icon">${icon.users(26)}</div>
      <h3>${filtered ? `No ${who} matches` : `No ${who}s yet`}</h3>
      <p>${
        filtered
          ? `No ${who} matches that filter and search. Clear them to see everyone.`
          : kind === 'interns'
            ? 'Add one with "+ Intern" next to any member under Admin panel → Manage users.'
            : 'Add pentesters under Admin panel → Manage users and they will appear here.'
      }</p>
      ${filtered ? '<button class="btn" data-board-clear>Clear filter</button>' : ''}
    </div>`;
}

function boardTableHTML(rows = boardPentesters(), opts = {}) {
  if (!rows.length) return boardEmptyHTML();
  return `<table class="board-table">
      <thead>
        <tr>
          <th class="col-person">Pentester</th>
          <th class="col-avail">Status</th>
          <th class="col-doing">Projects &amp; retests</th>
          <th class="col-idle">Idle since</th>
          <th class="col-note">Notes</th>
        </tr>
      </thead>
      <tbody>${rows.map((p) => boardRowHTML(p, opts)).join('')}</tbody>
    </table>`;
}

/**
 * "2 of 9" — the count line, so a filter never silently hides people.
 *
 * It counts the whole board, both tables, because both tables are on screen: a
 * per-table figure here said "Showing 0 of 7" while two interns sat visible below
 * it. The split is the headings' job; this line answers "did my filter find anyone".
 */
function boardCountHTML() {
  const total = (state.board || []).length;
  const shown = boardRows().length;
  const filtered = Boolean(state.boardFilter || (state.boardQuery || '').trim());
  return filtered
    ? `<span class="bt-count">Showing <strong>${shown}</strong> of ${total}</span>
       <button class="bt-clear" data-board-clear>Clear</button>`
    : `<span class="bt-count"><strong>${total}</strong> people</span>`;
}

/** The four cards: they double as the filter. One control, two jobs — the number
 *  you were reading anyway is the button that narrows the list to it. */
/** Just the four cards — the caller owns the .board-summary grid around them, so
 *  an in-place repaint never nests a second grid inside the first. */
function boardSummaryHTML() {
  const t = state.boardTotals || { people: 0, idle: 0, onProject: 0, unavailable: 0, idleDays: 0 };
  const filter = state.boardFilter || '';
  const card = (key, tone, label, value, sub) => `
    <button type="button" class="bs-card" data-tone="${tone}" data-board-filter="${key}"
            aria-pressed="${filter === key}" title="${
              key ? `Show only ${label.toLowerCase()}` : 'Show everyone'
            }">
      <span class="bs-label">${label}</span>
      <span class="bs-val">${value}</span>
      <span class="bs-sub">${sub}</span>
    </button>`;

  return `
      ${card('', 'slate', 'Team size', t.people, 'everyone on the board')}
      ${card('On Project', 'amber', 'On project', t.onProject, 'currently assigned')}
      ${card('Idle', 'green', 'Idle', t.idle, `${t.idleDays} total idle day${t.idleDays === 1 ? '' : 's'}`)}
      ${card('Unavailable', 'violet', 'Unavailable', t.unavailable, 'leave, exam, research')}`;
}

function teamHTML() {
  return `<div class="board-page">
    <div class="board-summary">${boardSummaryHTML()}</div>
    <div class="board-toolbar">
      <label class="bt-search">
        ${icon.search(14)}
        <input id="board-search" type="search" placeholder="Search a name, level, project or note…"
               value="${h(state.boardQuery || '')}" autocomplete="off">
      </label>
      <div class="bt-meta">${boardCountHTML()}</div>
    </div>
    <div class="board-tables">${boardSectionsHTML()}</div>
  </div>`;
}

/**
 * The two tables, or one when there are no interns yet.
 *
 * Headings only exist when the page has something to tell apart: a board with no
 * interns keeps the single unlabelled table it always had, because a heading that
 * reads "Pentesters" over the only table on screen is noise.
 */
function boardSectionsHTML() {
  const people = boardPentesters();
  const interns = boardInterns();
  const hasInterns = (state.board || []).some((r) => r.subrole === 'Intern');

  const head = (label, n, note) => `
    <div class="board-sect-head">
      <h3>${label}</h3>
      <span class="bt-count"><strong>${n}</strong></span>
      ${note ? `<p>${note}</p>` : ''}
    </div>`;

  return `
    ${hasInterns ? head('Pentesters', people.length) : ''}
    <div class="board-wrap" data-board-table="pentesters">${boardTableHTML(people)}</div>
    ${
      hasInterns
        ? `${head('Interns', interns.length, 'Trainees — listed apart from the bench')}
           <div class="board-wrap" data-board-table="interns">${
             interns.length ? boardTableHTML(interns, { interns: true }) : boardEmptyHTML('interns')
           }</div>`
        : ''
    }`;
}

/** Repaints the rows and the count only — the toolbar keeps its focus. */
function repaintBoard() {
  const page = document.querySelector('.board-page');
  if (!page) return;
  // Both tables live in one container, so a status change repaints the split too
  // (an intern changing to Idle must move a number in the interns heading).
  const tables = page.querySelector('.board-tables');
  if (tables) tables.innerHTML = boardSectionsHTML();
  const meta = page.querySelector('.bt-meta');
  if (meta) meta.innerHTML = boardCountHTML();
  // The cards are the totals, so they move with the rows — a status change that
  // repainted only the table left "On project 5" sitting over four people.
  const summary = page.querySelector('.board-summary');
  if (summary) summary.innerHTML = boardSummaryHTML();
  page.querySelectorAll('[data-board-filter]').forEach((b) => {
    b.setAttribute('aria-pressed', String((state.boardFilter || '') === b.dataset.boardFilter));
  });
}

async function loadBoard() {
  const token = nextLoadToken('board');
  try {
    const res = await api.availability();
    if (!isCurrentLoad('board', token)) return;
    state.board = res.board;
    state.boardTotals = res.totals;
  } catch (err) {
    if (!isCurrentLoad('board', token)) return;
    toast(err.message, 'err');
  }
}

function bindTeam() {
  // Delegated from the page wrapper, which `mountContent` re-creates on every
  // render: a filter change repaints the table without rebinding anything, and no
  // listener can stack up on the stable `#content`.
  const page = document.querySelector('.board-page');
  if (!page) return;

  const noteButton = (el) => el.closest('[data-avail-note]');
  const personFor = (id, list) => list.find((p) => Number(p.id) === Number(id));

  page.addEventListener('click', (e) => {
    const filterCard = e.target.closest('[data-board-filter]');
    if (filterCard) {
      // Clicking the active card again clears it, so the same control widens and
      // narrows and there is no separate "all" button to hunt for.
      const next = filterCard.dataset.boardFilter || '';
      state.boardFilter = state.boardFilter === next ? '' : next;
      repaintBoard();
      return;
    }

    if (e.target.closest('[data-board-clear]')) {
      state.boardFilter = '';
      state.boardQuery = '';
      const search = page.querySelector('#board-search');
      if (search) search.value = '';
      repaintBoard();
      return;
    }

    const note = noteButton(e.target);
    if (note) {
      const person = personFor(note.dataset.availNote, state.board);
      if (person) openAvailabilityNote(person);
      return;
    }

    const avail = e.target.closest('[data-avail-open]');
    if (avail) {
      e.stopPropagation();
      const person = personFor(avail.dataset.availOpen, state.board);
      if (person) openAvailabilityMenu(person, avail);
      return;
    }

    const assign = e.target.closest('[data-assign-open]');
    if (assign) {
      e.stopPropagation();
      const person = personFor(assign.dataset.assignOpen, state.board);
      if (person) openAssignMenu(person, assign);
      return;
    }

    const project = e.target.closest('[data-open-project]');
    if (project) {
      openProject(Number(project.dataset.openProject));
      return;
    }

    const face = e.target.closest('[data-person]');
    if (face) {
      e.stopPropagation();
      openPerson(Number(face.dataset.person));
    }
  });

  // The name is a `role="button"` span for the same reason as elsewhere: it sits
  // inside a cell with other controls, so it cannot be a nested <button>.
  page.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const face = e.target.closest('[data-person]');
    if (!face) return;
    e.preventDefault();
    openPerson(Number(face.dataset.person));
  });

  const search = page.querySelector('#board-search');
  if (search) {
    let t;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.boardQuery = search.value;
        repaintBoard();
      }, 140);
    });
    // Escape clears the box without leaving the field — the browser's own
    // behaviour would clear it silently and leave the list filtered.
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && search.value) {
        e.preventDefault();
        search.value = '';
        state.boardQuery = '';
        repaintBoard();
      }
    });
  }
}

/** One shared portal menu for the board, reused by every row. */
let boardMenu = null;

function closeBoardMenu() {
  if (!boardMenu) return;
  boardMenu.remove();
  boardMenu = null;
  // The pill that opened it says so — the styling and screen readers both read this.
  document.querySelectorAll('[data-avail-open][aria-expanded="true"]').forEach((b) => {
    b.setAttribute('aria-expanded', 'false');
  });
  document.removeEventListener('mousedown', boardMenuOutside, true);
  document.removeEventListener('keydown', boardMenuEscape, true);
}
function boardMenuOutside(e) {
  if (!boardMenu) return;
  if (e.target.closest('[data-avail-menu]') || e.target.closest('[data-avail-open]')) return;
  closeBoardMenu();
}
function boardMenuEscape(e) {
  if (e.key === 'Escape') closeBoardMenu();
}

function openAvailabilityMenu(person, toggle) {
  closeBoardMenu();

  const item = (value) =>
    `<button type="button" class="avail-item ${value === person.status ? 'on' : ''}"
       data-avail-set="${h(value)}">
       ${availabilityBadge(value, false)}
       ${value === person.status ? `<span class="qs-check">${icon.check(14)}</span>` : ''}
     </button>`;

  const menu = document.createElement('div');
  menu.className = 'avail-menu';
  menu.setAttribute('data-avail-menu', '');
  menu.innerHTML = `
    <div class="avail-menu-head">
      <strong>${h(person.name)}</strong>
      <span>${
        AVAIL_MANUAL.includes(person.status) || person.automatic
          ? 'Manual status overrides the automatic one.'
          : ''
      }</span>
    </div>
    <div class="avail-menu-group">
      <span class="avail-group-label">Automatic</span>
      ${item('On Project')}
      ${item('Idle')}
    </div>
    <div class="avail-menu-group">
      <span class="avail-group-label">Manual</span>
      ${AVAIL_MANUAL.map((v) => item(v)).join('')}
    </div>
    ${
      person.automatic
        ? ''
        : `<button type="button" class="avail-reset" data-avail-set="">${icon.refresh(13)} Back to automatic</button>`
    }`;
  document.body.appendChild(menu);
  boardMenu = menu;
  toggle.setAttribute('aria-expanded', 'true');

  // Position under the pill, flipping up when the lower half of the screen is
  // too tight — the same lesson the project status dropdown taught us.
  const box = toggle.getBoundingClientRect();
  const mh = menu.offsetHeight;
  const mw = menu.offsetWidth;
  const below = window.innerHeight - box.bottom;
  const top = below < mh + 12 && box.top > below ? box.top - mh - 6 : box.bottom + 6;
  menu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - mh - 8))}px`;
  menu.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - mw - 8))}px`;

  menu.querySelectorAll('[data-avail-set]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const value = btn.dataset.availSet;
      closeBoardMenu();
      await saveAvailability(person, { status: value });
    });
  });

  // Defer the outside-click listener: this very click opened the menu.
  setTimeout(() => {
    document.addEventListener('mousedown', boardMenuOutside, true);
    document.addEventListener('keydown', boardMenuEscape, true);
  }, 0);
}

function openAvailabilityNote(person) {
  openModal({
    title: 'Note',
    subtitle: `${person.name} · ${person.status}`,
    body: `
      <div class="field">
        <label class="label" for="av-note">Note</label>
        <textarea class="textarea" id="av-note" rows="3"
          placeholder="e.g. On leave until 12 Nov, back on the 13th.">${h(person.availabilityNote || '')}</textarea>
        <span class="form-hint">Visible to the whole team on the status board.</span>
      </div>`,
    footer: `
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>Save note</button>`,
    onMount: (modal, close) => {
      const save = async () => {
        const note = modal.querySelector('#av-note').value.trim();
        const ok = await saveAvailability(person, { note }, { silent: true });
        if (ok) close();
      };
      modal.querySelector('[data-save]').addEventListener('click', save);
      modal.querySelector('[data-cancel]').addEventListener('click', close);
    },
  });
}

async function saveAvailability(person, payload, opts = {}) {
  try {
    const res = await api.updateAvailability(person.id, payload);
    state.board = res.board;
    state.boardTotals = (await api.availability()).totals;
    // Repaint the table only when the board is the page on screen: a full
    // re-mount would throw away what is typed in the search box.
    if (state.nav === 'team') {
      state.boardLoaded = true;
      repaintBoard();
    } else {
      mountContent();
    }
    if (!opts.silent) toast(`${person.name} → ${res.pentester?.status || 'updated'}`);
    return true;
  } catch (err) {
    toast(err.message, 'err');
    return false;
  }
}

/**
 * Quick-assign picker: every project this pentester could be put on, with the
 * ones they are already on marked. Lives in <body> for the same reason the
 * status menu does — no transformed/clipping ancestor can reach it there.
 */
let assignMenu = null;

function closeAssignMenu() {
  document.removeEventListener('mousedown', onAssignOutside, true);
  document.removeEventListener('keydown', onAssignEscape, true);
  if (!assignMenu) return;
  assignMenu.remove();
  assignMenu = null;
}

function onAssignOutside(e) {
  if (!assignMenu) return;
  if (e.target.closest('[data-assign-menu]') || e.target.closest('[data-assign-open]')) return;
  closeAssignMenu();
}

function onAssignEscape(e) {
  if (e.key === 'Escape' && assignMenu) {
    e.stopPropagation();
    closeAssignMenu();
  }
}

async function openAssignMenu(person, toggle) {
  if (assignMenu) {
    const same = assignMenu.dataset.owner === String(person.id);
    closeAssignMenu();
    if (same) return;
  }
  let projects = [];
  try {
    const res = await api.projects({});
    projects = res.projects;
  } catch (err) {
    toast(err.message, 'err');
    return;
  }
  const mine = new Set((person.currentProjects || []).map((p) => Number(p.id)));
  // Closed engagements are not something you assign work to.
  const open = projects.filter((p) => p.status !== 'Done');

  const menu = document.createElement('div');
  menu.className = 'assign-menu';
  menu.setAttribute('data-assign-menu', '');
  menu.dataset.owner = String(person.id);
  menu.innerHTML = `
    <div class="avail-menu-head">
      <strong>${h(person.name)}</strong>
      <span>Assign to a project</span>
    </div>
    <div class="assign-list">
      ${
        open.length
          ? open
              .map(
                (p) => `<button type="button" class="assign-item ${mine.has(Number(p.id)) ? 'on' : ''}"
                   data-assign-toggle="${p.id}">
                   <span class="assign-check">${mine.has(Number(p.id)) ? icon.check(13) : ''}</span>
                   <span class="assign-name">${h(p.name)}</span>
                   <span class="badge" data-tone="${propTone('status', p.status)}">${h(propLabel('status', p.status))}</span>
                 </button>`
              )
              .join('')
          : '<div class="combo-empty">No open projects to assign</div>'
      }
    </div>`;

  document.body.appendChild(menu);
  assignMenu = menu;

  // place it under the button, clamped into the viewport
  const box = toggle.getBoundingClientRect();
  const GAP = 6;
  const MARGIN = 8;
  const mh = menu.offsetHeight;
  const mw = menu.offsetWidth;
  const roomBelow = window.innerHeight - box.bottom - MARGIN;
  const roomAbove = box.top - MARGIN;
  const flip = roomBelow < mh && roomAbove > roomBelow;
  let top = flip ? box.top - mh - GAP : box.bottom + GAP;
  let left = box.left;
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - mh - MARGIN));
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - mw - MARGIN));
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  menu.querySelectorAll('[data-assign-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const projectId = Number(btn.dataset.assignToggle);
      const isOn = mine.has(projectId);
      btn.disabled = true;
      try {
        const res = isOn
          ? await api.unassignPentester(projectId, person.id)
          : await api.assignPentester(projectId, person.id);
        state.board = res.board;
        const fresh = res.board.find((p) => Number(p.id) === Number(person.id));
        state.boardTotals = await api.availability().then((r) => r.totals);
        mountContent();
        toast(isOn ? 'Removed from project' : 'Assigned to project', 'ok');
        closeAssignMenu();
        if (fresh) {
          const next = document.querySelector(`[data-assign-open="${fresh.id}"]`);
          if (next) openAssignMenu(fresh, next);
        }
      } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false;
      }
    });
  });

  document.addEventListener('mousedown', onAssignOutside, true);
  document.addEventListener('keydown', onAssignEscape, true);
}

/* ============================================================
   Project properties (Admin panel → Properties)
   ------------------------------------------------------------
   The categories and statuses a project can carry, as data instead of
   two hard-coded arrays. A project stores the property's KEY; the label
   and the badge colour are edited here and applied everywhere at once.

   The seeded rows are `locked` — "Done" ends an engagement, "Mobile" owns
   the platform field, and SQL compares against those keys — so they can be
   renamed, recoloured and reordered but never deleted. Rows an admin adds
   are ordinary and disappear once nothing uses them.
   ============================================================ */
const PROPERTY_TONES = ['slate', 'blue', 'cyan', 'violet', 'amber', 'green', 'rose'];

function propertiesHTML() {
  return `<div class="admin">
    <div class="admin-head">
      <p>
        The categories and statuses a project can carry. Renaming one here renames it
        everywhere; the projects keep their place, because a project stores the key
        and this page edits the label.
      </p>
    </div>
    ${propertySectionHTML('category', 'Categories', 'What kind of target the engagement covers. “Mobile” also owns the platform field.')}
    ${propertySectionHTML('status', 'Statuses', 'Where an engagement stands. “Done” is what makes a project finished; it cannot be deleted.')}
  </div>`;
}

function propertySectionHTML(kind, title, note) {
  const rows = propList(kind);
  return `<section class="admin-sec">
    <div class="admin-sec-head">
      <h3>${h(title)}</h3>
      <span class="admin-count">${rows.length}</span>
      <p>${h(note)}</p>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-prop-add="${kind}">${icon.plus(13)} ${kind === 'status' ? 'Status' : 'Category'}</button>
    </div>
    ${
      rows.length
        ? `<div class="dev-tablewrap">
             <table class="dev-table prop-table">
               <thead><tr>
                 <th class="dev-h-label"><span class="dev-h-inner"><span class="dev-h-label">Label</span></span></th>
                 <th class="dev-h-key"><span class="dev-h-inner"><span class="dev-h-label">Stored key</span></span></th>
                 <th class="dev-h-badge"><span class="dev-h-inner"><span class="dev-h-label">Looks like</span></span></th>
                 <th class="dev-h-acts"><span class="sr-only">Actions</span></th>
               </tr></thead>
               <tbody>${rows.map((p, i) => propertyRowHTML(kind, p, i, rows.length)).join('')}</tbody>
             </table>
           </div>`
        : `<div class="empty">
             <div class="icon">${icon.tag(24)}</div>
             <h3>No ${h(title.toLowerCase())} yet</h3>
             <p>Add one, and it shows up in the project form and the filter bar immediately.</p>
           </div>`
    }
  </section>`;
}

function propertyRowHTML(kind, p, index, total) {
  return `<tr data-prop-row="${p.id}">
    <td class="dev-name">${h(p.label)}${
      p.locked ? '<span class="prop-lock" title="Built into the workflow — renaming and recolouring are fine, deleting is not">built in</span>' : ''
    }</td>
    <td class="dev-mono-cell">${h(p.key)}</td>
    <td><span class="badge" data-tone="${h(p.tone)}"><span class="dot"></span>${h(p.label)}</span></td>
    <td class="dev-acts"><span class="dev-acts-inner">
      <button type="button" class="btn btn-icon" data-prop-up="${p.id}" data-kind="${kind}"
        title="Move up" aria-label="Move ${h(p.label)} up" ${index === 0 ? 'disabled' : ''}>${icon.arrowUp(13)}</button>
      <button type="button" class="btn btn-icon" data-prop-down="${p.id}" data-kind="${kind}"
        title="Move down" aria-label="Move ${h(p.label)} down" ${index === total - 1 ? 'disabled' : ''}>${icon.arrowDown(13)}</button>
      <button type="button" class="btn btn-icon" data-prop-edit="${p.id}" data-kind="${kind}"
        title="Edit" aria-label="Edit ${h(p.label)}">${icon.edit(13)}</button>
      <button type="button" class="btn btn-icon btn-icon-danger" data-prop-del="${p.id}" data-kind="${kind}"
        title="${p.locked ? 'Built into the workflow — rename it instead' : 'Delete'}"
        aria-label="Delete ${h(p.label)}" ${p.locked ? 'disabled' : ''}>${icon.trash(13)}</button>
    </span></td>
  </tr>`;
}

function bindProperties() {
  document.querySelectorAll('[data-prop-add]').forEach((b) =>
    b.addEventListener('click', () => openPropertyForm(b.dataset.propAdd, null))
  );
  document.querySelectorAll('[data-prop-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openPropertyForm(b.dataset.kind, propertyById(b.dataset.kind, b.dataset.propEdit))
    )
  );
  document.querySelectorAll('[data-prop-del]').forEach((b) =>
    b.addEventListener('click', () =>
      deleteProperty(b.dataset.kind, propertyById(b.dataset.kind, b.dataset.propDel))
    )
  );
  document.querySelectorAll('[data-prop-up]').forEach((b) =>
    b.addEventListener('click', () => moveProperty(b.dataset.kind, b.dataset.propUp, -1))
  );
  document.querySelectorAll('[data-prop-down]').forEach((b) =>
    b.addEventListener('click', () => moveProperty(b.dataset.kind, b.dataset.propDown, 1))
  );
}

function propertyById(kind, id) {
  return propList(kind).find((p) => Number(p.id) === Number(id)) || null;
}

/**
 * Create or edit one property.
 *
 * The badge swatches are the choice itself — picking a tone from a list of colour
 * names and then squinting at the row behind the dialog is not a preview.
 */
function openPropertyForm(kind, property = null) {
  const editing = Boolean(property);
  const noun = kind === 'status' ? 'status' : 'category';
  const tone = property?.tone || 'slate';

  openModal({
    title: editing ? `Edit ${noun}` : `New ${noun}`,
    subtitle: editing
      ? 'The stored key never changes — only the word people read and its colour.'
      : 'It appears in the project form, the filters and every badge.',
    body: `
      <div class="field">
        <label class="label" for="prop-label">Name</label>
        <input class="input" id="prop-label" value="${h(property?.label || '')}"
          placeholder="${kind === 'status' ? 'e.g. In progress' : 'e.g. Cloud'}" />
        ${editing ? `<span class="form-hint">Stored as <code>${h(property.key)}</code> — projects keep that value, so nothing moves.</span>` : ''}
      </div>
      <div class="field">
        <label class="label">Badge colour</label>
        <div class="prop-tones" id="prop-tones">
          ${PROPERTY_TONES.map(
            (t) => `<button type="button" class="prop-tone ${t === tone ? 'on' : ''}" data-tone="${t}"
              data-tone-value="${t}" aria-label="${t}" aria-pressed="${t === tone}">
              <span class="badge" data-tone="${t}"><span class="dot"></span>${h(property?.label || 'Preview')}</span>
            </button>`
          ).join('')}
        </div>
      </div>`,
    footer: `<span class="spacer"></span>
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : `Add ${noun}`}</button>`,
    onMount: (modal, close) => {
      let chosen = tone;
      const label = modal.querySelector('#prop-label');

      const repaintPreview = () => {
        const text = label.value.trim() || (editing ? property.label : 'Preview');
        modal.querySelectorAll('.prop-tone').forEach((btn) => {
          btn.classList.toggle('on', btn.dataset.toneValue === chosen);
          btn.setAttribute('aria-pressed', btn.dataset.toneValue === chosen ? 'true' : 'false');
          btn.querySelector('.badge').textContent = '';
          btn.querySelector('.badge').innerHTML = `<span class="dot"></span>${h(text)}`;
        });
      };
      modal.querySelectorAll('.prop-tone').forEach((btn) =>
        btn.addEventListener('click', () => {
          chosen = btn.dataset.toneValue;
          repaintPreview();
        })
      );
      label.addEventListener('input', repaintPreview);

      modal.querySelector('[data-cancel]').addEventListener('click', close);
      modal.querySelector('[data-save]').addEventListener('click', async () => {
        const value = label.value.trim();
        if (!value) {
          toast('A name is required', 'err');
          label.focus();
          return;
        }
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          const payload = { label: value, tone: chosen };
          const res = editing
            ? await api.updateProperty(kind, property.id, payload)
            : await api.createProperty(kind, payload);
          afterPropertiesChanged(res);
          toast(editing ? `${value} updated` : `${value} added`);
          close();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    },
  });
}

async function deleteProperty(kind, property) {
  if (!property) return;
  const ok = await confirmDialog({
    title: `Delete “${property.label}”?`,
    message: `Any project still carrying it will block the delete — the server refuses rather than leaving rows nobody can render.`,
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  try {
    const res = await api.deleteProperty(kind, property.id);
    afterPropertiesChanged(res);
    toast(`${property.label} deleted`);
  } catch (err) {
    toast(err.message, 'err');
  }
}

/** Reorder by one slot: swap with the neighbour and persist the whole order. */
async function moveProperty(kind, id, delta) {
  const list = propList(kind).slice();
  const at = list.findIndex((p) => Number(p.id) === Number(id));
  const to = at + delta;
  if (at < 0 || to < 0 || to >= list.length) return;
  const [moved] = list.splice(at, 1);
  list.splice(to, 0, moved);
  try {
    const res = await api.reorderProperties(
      kind,
      list.map((p) => p.id)
    );
    afterPropertiesChanged(res);
  } catch (err) {
    toast(err.message, 'err');
  }
}

/**
 * Adopt a writer's response: it carries the whole fresh list, so the registry, the
 * sidebar badge and whichever page is open all move together.
 */
function afterPropertiesChanged(payload) {
  setProperties(payload);
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.outerHTML = sidebarHTML();
  bindSidebar();
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.nav));
  mountContent();
}

/* ============================================================
   Users (admin panel)
   ------------------------------------------------------------
   Pentesters and supervisors were two pages built on the same
   `users` table, the same `createUser` path and the same question —
   "who works here?". Two pages meant adding someone started with a
   guess about which page they belonged on, and the two drifted into
   different copy for the same account. One page now holds both: the
   reporting tree, the client-facing supervisors, and a tab when you
   only want one of them.
   ============================================================ */
const USER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'pentesters', label: 'Pentesters' },
  { id: 'supervisors', label: 'Project managers' },
];
/**
 * The account type that owns engagements. The PROJECT FIELD is called Supervisor
 * (SV) and accepts a PM or a pentester; this constant is the role itself, and the
 * role is still called Project Manager.
 */
const PM_ROLE = 'Project Manager';

function usersHTML() {
  const pentesters = state.pentesters || [];
  const supervisors = state.supervisors || [];
  const tab = USER_TABS.some((t) => t.id === state.usersTab) ? state.usersTab : 'all';
  const tabLabel = USER_TABS.find((t) => t.id === tab).label;
  // `/api/supervisors` returns the pool (Supervisor accounts AND pentesters, because
  // a pentester may supervise), so the account count has to dedupe by id.
  const total = new Set([...pentesters, ...supervisors].map((u) => Number(u.id))).size;

  return `<div class="admin">
    <div class="admin-head">
      <p>
        Everyone who can sign in. Pentesters are arranged as a reporting tree — lead,
        sub lead, member, intern — and supervisors own the engagements.
      </p>
      <div class="head-acts">
        <button class="btn" data-users-import>${icon.upload(15)} Import</button>
        <button class="btn btn-primary" data-user-new>${icon.plus()} New user</button>
      </div>
    </div>
    <div class="admin-tabs">
      ${segmented('users-tab', USER_TABS.map((t) => t.label), tabLabel)}
      <span class="admin-count">${total} account${total === 1 ? '' : 's'}</span>
    </div>
    ${tab === 'supervisors' ? '' : pentesterSectionHTML()}
    ${tab === 'pentesters' ? '' : supervisorSectionHTML()}
  </div>`;
}

/** The pentest tree: one section, with its own add control at the top. */
function pentesterSectionHTML() {
  const leads = state.pentesterTree || [];
  const n = (state.pentesters || []).length;
  const head = `<div class="admin-sec-head">
      <h3>Pentesters</h3>
      <span class="admin-count">${n}</span>
      <p>Sub leads report to a lead; members and interns attach to whoever runs their work.</p>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-pent-add="Lead">${icon.plus(13)} Lead</button>
    </div>`;

  if (!leads.length) {
    return `<section class="admin-sec">${head}
      <div class="empty">
        <div class="icon">${icon.users(26)}</div>
        <h3>No pentesters yet</h3>
        <p>Start with a lead, then add the sub leads and members under them — or import the whole team at once.</p>
        <button class="btn btn-primary" data-pent-add="Lead">${icon.plus()} New lead</button>
      </div>
    </section>`;
  }

  return `<section class="admin-sec">${head}
    <div class="tree">${leads.map((lead) => leadNodeHTML(lead)).join('')}</div>
  </section>`;
}

/** The project managers, as cards: who they are and which clients they own. */
function supervisorSectionHTML() {
  // Cards for the Project Manager ROLE only: a pentester who supervises one engagement
  // already has a row in the tree above, and a second card would read as a
  // duplicate person.
  const supervisors = (state.supervisors || []).filter((u) => u.role === PM_ROLE);
  const head = `<div class="admin-sec-head">
      <h3>Project managers</h3>
      <span class="admin-count">${supervisors.length}</span>
      <p>Each project has one, and a client can name several as its usual owners. A pentester can supervise too — pick them on the project itself.</p>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-supervisor-add>${icon.plus(13)} Project manager</button>
    </div>`;

  if (!supervisors.length) {
    return `<section class="admin-sec">${head}
      <div class="empty">
        <div class="icon">${icon.userCheck(26)}</div>
        <h3>No project managers yet</h3>
        <p>Add one, then give them a client or two so new projects are owned automatically.</p>
        <button class="btn btn-primary" data-supervisor-add>${icon.plus()} New project manager</button>
      </div>
    </section>`;
  }

  return `<section class="admin-sec">${head}
    <div class="client-grid">${supervisors.map(supervisorCardHTML).join('')}</div>
  </section>`;
}

/**
 * The interns of one person, as rows under them.
 *
 * An intern can hang off a member, a sub lead or a lead, so this is called from
 * all three places rather than nesting one special case. They are drawn at the
 * deepest indent everywhere, because "trainee" is what the level means — not
 * "seniority relative to the person above me".
 */
function internRowsHTML(parentId) {
  const interns = (state.pentesters || []).filter(
    (p) => p.subrole === 'Intern' && Number(p.parentId) === Number(parentId)
  );
  if (!interns.length) return '';
  return `<div class="intern-rows">${interns.map((i) => internRowHTML(i)).join('')}</div>`;
}

/** How many projects an intern is currently attached to (a member row shows the same). */
function internProjectCount(id) {
  return (state.projects || []).filter((p) =>
    (p.pentesters || []).some((pp) => Number(pp.id) === Number(id))
  ).length;
}

function internRowHTML(i) {
  return `
    <div class="member-row is-intern" data-member="${i.id}">
      <span class="tree-rail"></span>
      ${avatar(i.name, 'sm', i.id)}
      <strong>${h(i.name)}</strong>
      ${subroleBadge('Intern')}
      ${contactHTML(i, 'mr-contact')}
      <span class="spacer"></span>
      <span class="mr-meta">${internProjectCount(i.id)} project${internProjectCount(i.id) === 1 ? '' : 's'}</span>
      <button class="btn btn-icon" data-pent-edit="${i.id}" aria-label="Edit ${h(i.name)}">${icon.edit()}</button>
      <button class="btn btn-icon" data-pent-del="${i.id}" aria-label="Remove ${h(i.name)}">${icon.trash()}</button>
    </div>`;
}

/** "+ Intern", with the parent already chosen — one click, no picker to fight. */
function addInternBtn(parentId, cls = 'btn btn-sm') {
  return `<button class="${cls}" data-pent-add="Intern" data-parent="${parentId}">${icon.plus()} Intern</button>`;
}

function leadNodeHTML(lead) {
  const kids = lead.children || [];
  // A member may hang off a sub lead or off the lead directly, so both places have
  // to be drawn — "where are my people" must not depend on how deep they sit.
  const subLeads = kids.filter((c) => c.subrole === 'Sub Lead');
  const directMembers = kids.filter((c) => c.subrole === 'Member');
  const ownInterns = kids.filter((c) => c.subrole === 'Intern');
  const nestedMembers = subLeads.flatMap((sl) =>
    (sl.children || []).filter((c) => c.subrole === 'Member')
  );
  const memberCount = nestedMembers.length + directMembers.length;
  const memberBlock = (list) =>
    `<div class="ts-members">${list.map((m) => memberRowHTML(m) + internRowsHTML(m.id)).join('')}</div>`;

  return `
    <section class="tree-lead" data-lead="${lead.id}">
      <header class="tree-head">
        <div class="th-avatar">${avatar(lead.name, '', lead.id)}</div>
        <div class="th-title">
          <strong>${h(lead.name)}</strong>
          <span>${subroleBadge('Lead')}<em>${subLeads.length} sub lead${subLeads.length === 1 ? '' : 's'} · ${memberCount} member${memberCount === 1 ? '' : 's'}${
            ownInterns.length
              ? ` · ${ownInterns.length} intern${ownInterns.length === 1 ? '' : 's'}`
              : ''
          }</em></span>
          ${contactHTML(lead)}
        </div>
        <span class="spacer"></span>
        <div class="th-actions">
          <button class="btn btn-sm" data-pent-add="Sub Lead" data-parent="${lead.id}">${icon.plus()} Sub lead</button>
          <button class="btn btn-sm" data-pent-add="Member" data-parent="${lead.id}">${icon.plus()} Member</button>
          ${addInternBtn(lead.id)}
          <button class="btn btn-icon" data-pent-edit="${lead.id}" aria-label="Edit ${h(lead.name)}">${icon.edit()}</button>
          <button class="btn btn-icon" data-pent-del="${lead.id}" aria-label="Remove ${h(lead.name)}">${icon.trash()}</button>
        </div>
      </header>
      ${internRowsHTML(lead.id)}
      ${directMembers.length ? memberBlock(directMembers) : ''}
      ${
        subLeads.length
          ? `<div class="tree-body">${subLeads.map((sl) => subLeadNodeHTML(sl)).join('')}</div>`
          : `<div class="tree-empty">${
              directMembers.length
                ? 'No sub leads under ' + h(lead.name) + ' yet.'
                : 'No sub leads or members under ' + h(lead.name) + ' yet.'
            }</div>`
      }
    </section>`;
}

function subLeadNodeHTML(sl) {
  // Children include interns of this sub lead; those are drawn by internRowsHTML so
  // the member count stays a count of members.
  const kids = sl.children || [];
  const members = kids.filter((m) => m.subrole !== 'Intern');
  return `
    <div class="tree-sub" data-sub="${sl.id}">
      <div class="ts-head">
        <span class="tree-rail"></span>
        <div class="th-avatar sm">${avatar(sl.name, '', sl.id)}</div>
        <div class="th-title">
          <strong>${h(sl.name)}</strong>
          <span>${subroleBadge('Sub Lead')}<em>${members.length} member${members.length === 1 ? '' : 's'}</em></span>
          ${contactHTML(sl)}
        </div>
        <span class="spacer"></span>
        <div class="th-actions">
          <button class="btn btn-sm" data-pent-add="Member" data-parent="${sl.id}">${icon.plus()} Member</button>
          ${addInternBtn(sl.id)}
          <button class="btn btn-icon" data-pent-edit="${sl.id}" aria-label="Edit ${h(sl.name)}">${icon.edit()}</button>
          <button class="btn btn-icon" data-pent-del="${sl.id}" aria-label="Remove ${h(sl.name)}">${icon.trash()}</button>
        </div>
      </div>
      ${
        members.length
          ? `<div class="ts-members">${members
              .map((m) => memberRowHTML(m) + internRowsHTML(m.id))
              .join('')}</div>${internRowsHTML(sl.id)}`
          : `<div class="ts-members empty-row">No members yet under ${h(sl.name)}.</div>${internRowsHTML(sl.id)}`
      }
    </div>`;
}

function memberRowHTML(m) {
  const assigned = state.projects.filter((p) =>
    (p.pentesters || []).some((pp) => Number(pp.id) === Number(m.id))
  ).length;
  return `
    <div class="member-row" data-member="${m.id}">
      <span class="tree-rail"></span>
      ${avatar(m.name, 'sm', m.id)}
      <strong>${h(m.name)}</strong>
      ${subroleBadge('Member')}
      ${contactHTML(m, 'mr-contact')}
      <span class="spacer"></span>
      <span class="mr-meta">${assigned} project${assigned === 1 ? '' : 's'}</span>
      ${addInternBtn(m.id, 'btn btn-sm mr-add-intern')}
      <button class="btn btn-icon" data-pent-edit="${m.id}" aria-label="Edit ${h(m.name)}">${icon.edit()}</button>
      <button class="btn btn-icon" data-pent-del="${m.id}" aria-label="Remove ${h(m.name)}">${icon.trash()}</button>
    </div>`;
}

function supervisorCardHTML(m) {
  // Every client that names this person as a default SV, plus every project
  // they actually own. Both matter: defaults drive auto-assignment, owned
  // projects are the current workload.
  const defaults = (state.clients || []).filter((c) =>
    (c.supervisors || []).some((x) => Number(x.id) === Number(m.id))
  );
  const owned = (state.projects || []).filter((p) => Number(p.supervisorId) === Number(m.id));
  const openOwned = owned.filter((p) => p.status !== 'Done');

  return `
    <div class="client-card sv-card" data-supervisor="${m.id}">
      <div class="client-card-head">
        <div class="cc-avatar sv-avatar">${h(initials(m.name))}</div>
        <div class="cc-title">
          <h3>${h(m.name)}</h3>
          <div class="cc-meta">
            <span class="tag">Project manager</span>
            <span>${owned.length} project${owned.length === 1 ? '' : 's'}${openOwned.length ? ` · ${openOwned.length} open` : ''}</span>
          </div>
        </div>
        <div class="cc-actions">
          <button class="btn btn-icon" data-supervisor-edit="${m.id}" aria-label="Edit ${h(m.name)}">${icon.edit()}</button>
          <button class="btn btn-icon danger" data-supervisor-del="${m.id}" aria-label="Delete ${h(m.name)}">${icon.trash()}</button>
        </div>
      </div>

      <div class="sv-contacts">
        ${
          m.phone || m.email
            ? contactLine(m.phone, m.email)
            : '<span class="sv-no-contact">No contact details yet</span>'
        }
      </div>

      <div class="sv-clients">
        <div class="sv-block-label">Default SV for</div>
        ${
          defaults.length
            ? `<div class="sv-chips">${defaults
                .map((c) => `<span class="sv-chip">${icon.building(11)}${h(c.name)}</span>`)
                .join('')}</div>`
            : '<span class="sv-no-contact">No client assigned yet</span>'
        }
      </div>
    </div>`;
}

function bindUsers() {
  const content = document.getElementById('content');
  if (content) {
    bindSegmented(content, 'users-tab', (label) => {
      const hit = USER_TABS.find((t) => t.label === label);
      state.usersTab = hit ? hit.id : 'all';
      mountContent();
    });
    // The tree's avatars open the person card, the same as an avatar on a project
    // card. Bound on the page container, which is rebuilt on every render, so the
    // listener never stacks up the way one on the stable `#content` would.
    content.querySelector('.admin')?.addEventListener('click', (ev) => {
      const face = ev.target.closest('[data-person]');
      if (!face) return;
      ev.preventDefault();
      ev.stopPropagation();
      openPerson(Number(face.dataset.person));
    });
  }

  document.querySelectorAll('[data-user-new]').forEach((b) =>
    b.addEventListener('click', () => openUserForm())
  );
  document.querySelectorAll('[data-users-import]').forEach((b) =>
    b.addEventListener('click', () => openUserImport())
  );
  document.querySelectorAll('[data-pent-add]').forEach((b) =>
    b.addEventListener('click', () =>
      openUserForm(null, {
        role: 'Pentester',
        subrole: b.dataset.pentAdd,
        parentId: b.dataset.parent ? Number(b.dataset.parent) : null,
      })
    )
  );
  document.querySelectorAll('[data-pent-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openUserForm(state.pentesters.find((p) => Number(p.id) === Number(b.dataset.pentEdit)))
    )
  );
  document.querySelectorAll('[data-pent-del]').forEach((b) =>
    b.addEventListener('click', () =>
      deletePentester(state.pentesters.find((p) => Number(p.id) === Number(b.dataset.pentDel)))
    )
  );
  document.querySelectorAll('[data-supervisor-add]').forEach((b) =>
    b.addEventListener('click', () => openUserForm(null, { role: PM_ROLE }))
  );
  document.querySelectorAll('[data-supervisor-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openUserForm(state.supervisors.find((m) => Number(m.id) === Number(b.dataset.supervisorEdit)))
    )
  );
  document.querySelectorAll('[data-supervisor-del]').forEach((b) =>
    b.addEventListener('click', () =>
      deleteSupervisor(state.supervisors.find((m) => Number(m.id) === Number(b.dataset.supervisorDel)))
    )
  );
}

/**
 * A person's phone and e-mail, as one line on their row.
 *
 * The contact details were already editable in the user form and readable on the
 * supervisor cards, but a pentester's row showed nothing at all — so the fields
 * were impossible to find from the list and looked like they did not exist. The title
 * attribute carries the whole pair, because a row is one line and a long address has
 * to end in an ellipsis rather than push the buttons off it.
 */
function contactHTML(person, cls = 'th-contact') {
  if (!person?.phone && !person?.email) return '';
  const full = [person.phone, person.email].filter(Boolean).join(' · ');
  return `<span class="${cls}" title="${h(full)}">${contactLine(person.phone, person.email)}</span>`;
}

/** Which levels each level may report to — the same table the server enforces. */
const PARENT_LEVELS = {
  'Sub Lead': ['Lead'],
  // A member answers to whoever runs their work: the sub lead on a big team, the
  // lead directly on a small one.
  Member: ['Sub Lead', 'Lead'],
  Intern: ['Member', 'Sub Lead', 'Lead'],
};

/** "a member, a sub lead or a lead" — used in both the hint and the placeholder. */
function parentPhrase(subrole) {
  const names = (PARENT_LEVELS[subrole] || []).map((s) => s.toLowerCase());
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** What a level means, in the form's own words. */
function levelHint(subrole) {
  if (subrole === 'Lead') return 'A lead sits at the top of the tree and reports to nobody.';
  if (subrole === 'Sub Lead') return 'A sub lead reports to a lead.';
  if (subrole === 'Intern') {
    return 'An intern reports to a member, a sub lead or a lead, and gets their own table on Team status.';
  }
  return 'A member reports to a sub lead, or to the lead directly on a small team.';
}

/**
 * The "Reports to" control for a level: a select of legal parents, or a callout
 * when no legal parent exists yet. One function for the form and for the level
 * switch, because two hand-built copies of this drifted apart once already.
 */
function parentPickerHTML(subrole, selectedId = null) {
  const expected = parentPhrase(subrole);
  const choices = managerChoices(subrole, selectedId);
  if (!choices.length) {
    return `<div class="callout"><span>No ${expected} exists yet. Create one before adding a ${subrole.toLowerCase()}.</span></div>`;
  }
  return `<select class="select" id="uf-parent">
      <option value="">Select a ${expected}…</option>
      ${choices
        .map((m) => `<option value="${m.value}" ${m.selected ? 'selected' : ''}>${h(m.label)}</option>`)
        .join('')}
    </select>`;
}

/**
 * Create or edit one person.
 *
 * One form for both roles: the role switch reveals the fields that role actually
 * owns (a level and a reporting line, or client-facing contact details), so there
 * is a single place to add "someone who works here" instead of two that must be
 * chosen between before typing anything.
 *
 * Editing keeps the account's own role. The two PATCH endpoints validate different
 * fields, and turning a lead into a supervisor would leave their reports in a
 * tree with no branch above them.
 */
function openUserForm(person = null, preset = {}) {
  const editing = Boolean(person);
  const role = editing
    ? person.role === 'Admin'
      ? 'Admin'
      : person.role === PM_ROLE
        ? PM_ROLE
        : 'Pentester'
    : preset.role === PM_ROLE
      ? PM_ROLE
      : 'Pentester';
  const subrole = person?.subrole || preset.subrole || 'Member';
  const parentId = person ? person.parentId : preset.parentId ?? null;
  const isSupervisorRole = role === PM_ROLE;

  openModal({
    title: editing ? `Edit ${person.name}` : 'New user',
    subtitle: editing
      ? isSupervisorRole
        ? 'Project manager — client-facing owner of engagements'
        : 'Update the level or the reporting line'
      : 'Pick the role and the fields follow.',
    body: `
      ${
        editing
          ? ''
          : `<div class="field">
               <label class="label">Role</label>
               ${segmented('uf-role', ['Pentester', PM_ROLE], role)}
               <span class="form-hint">A pentester joins the reporting tree; a project manager owns engagements.</span>
             </div>`
      }
      <div class="field">
        <label class="label" for="uf-name">Full name</label>
        <input class="input" id="uf-name" placeholder="e.g. Rafi Pratama" value="${h(person?.name || '')}" />
      </div>
      ${
        editing
          ? ''
          : `<div class="form-row">
               <div class="field">
                 <label class="label" for="uf-username">Username</label>
                 <input class="input" id="uf-username" placeholder="e.g. rafi" autocomplete="off" />
                 <span class="form-hint">3-32 chars: a-z 0-9 . _ -</span>
               </div>
               <div class="field">
                 <label class="label" for="uf-password">Temporary password</label>
                 <input class="input" id="uf-password" type="text" value="${
                  isSupervisorRole ? 'manager123' : 'pentester123'
                }" />
                 <span class="form-hint">They can change it later. Minimum 6 characters.</span>
               </div>
             </div>`
      }
      <div id="uf-pent" ${isSupervisorRole ? 'hidden' : ''}>
        <div class="field">
          <label class="label">Level</label>
          ${segmented('uf-subrole', ENUMS.subrole, subrole, {
            Lead: 'violet',
            'Sub Lead': 'blue',
            Member: 'slate',
            Intern: 'cyan',
          })}
          <span class="form-hint" id="uf-level-hint">${levelHint(subrole)}</span>
        </div>
        <div class="field" id="uf-parent-row" ${subrole === 'Lead' ? 'hidden' : ''}>
          <label class="label">Reports to</label>
          <div id="uf-parent-host">${subrole === 'Lead' ? '' : parentPickerHTML(subrole, parentId)}</div>
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label class="label" for="uf-phone">Contact number</label>
          <input class="input" id="uf-phone" placeholder="+62 812 0000 0000" value="${h(person?.phone || '')}" />
        </div>
        <div class="field">
          <label class="label" for="uf-email">Email</label>
          <input class="input" id="uf-email" type="email" placeholder="name@company.id" value="${h(person?.email || '')}" />
        </div>
      </div>`,
    footer: `<span class="spacer"></span>
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Create user'}</button>`,
    onMount: (modal, close) => {
      const passInput = modal.querySelector('#uf-password');
      let passTouched = false;
      passInput?.addEventListener('input', () => {
        passTouched = true;
      });

      // Switching role swaps which half of the form is real. The password default
      // follows the role too — but only while the field still holds a default, so a
      // typed password is never overwritten under the user's hands.
      bindSegmented(modal, 'uf-role', (value) => {
        const pm = value === PM_ROLE;
        modal.querySelector('#uf-pent').hidden = pm;
        if (passInput && !passTouched) passInput.value = pm ? 'manager123' : 'pentester123';
      });

      // Switching level rebuilds the parent control: a lead has no parent, and the
      // legal parents for a sub lead are leads, not sub leads.
      bindSegmented(modal, 'uf-subrole', (value) => {
        const row = modal.querySelector('#uf-parent-row');
        modal.querySelector('#uf-level-hint').textContent = levelHint(value);
        row.hidden = value === 'Lead';
        modal.querySelector('#uf-parent-host').innerHTML =
          value === 'Lead' ? '' : parentPickerHTML(value, null);
      });

      modal.querySelector('[data-cancel]').addEventListener('click', close);
      modal.querySelector('[data-save]').addEventListener('click', async () => {
        const name = modal.querySelector('#uf-name').value.trim();
        if (!name) {
          toast('Name is required', 'err');
          modal.querySelector('#uf-name').focus();
          return;
        }
        const phone = modal.querySelector('#uf-phone').value.trim();
        const email = modal.querySelector('#uf-email').value.trim();
        if (email && !EMAIL_RE.test(email)) {
          toast('That email address looks wrong', 'err');
          return;
        }

        const roleNow = editing ? role : segmentedValue(modal, 'uf-role');
        const payload = { name, phone, email };
        if (roleNow !== PM_ROLE) {
          const level = segmentedValue(modal, 'uf-subrole');
          payload.subrole = level;
          if (level === 'Lead') {
            payload.parentId = null;
          } else {
            const sel = modal.querySelector('#uf-parent');
            if (!sel || !sel.value) {
              toast(`Choose which ${parentPhrase(level)} they report to`, 'err');
              return;
            }
            payload.parentId = Number(sel.value);
          }
        }

        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          if (editing) {
            if (roleNow === PM_ROLE) await api.updateSupervisor(person.id, payload);
            else await api.updatePentester(person.id, payload);
            toast('User updated');
          } else {
            const username = modal.querySelector('#uf-username').value.trim();
            const password = modal.querySelector('#uf-password').value;
            if (!username) throw new Error('Username is required');
            if (roleNow === PM_ROLE) await api.createSupervisor({ ...payload, username, password });
            else await api.createPentester({ ...payload, username, password });
            toast(`${name} added`);
          }
          close();
          await refreshUsers();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    },
  });
}

async function deletePentester(person) {
  if (!person) return;
  const ok = await confirmDialog({
    title: `Remove ${person.name}?`,
    message: `Their account and session are deleted. Projects they are assigned to stay in place, but lose this pentester.`,
    confirmLabel: 'Remove',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deletePentester(person.id);
    toast('Pentester removed');
    await refreshUsers();
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function deleteSupervisor(supervisor) {
  if (!supervisor) return;
  const owned = (state.projects || []).filter((p) => Number(p.supervisorId) === Number(supervisor.id));
  const ok = await confirmDialog({
    title: 'Delete project manager?',
    message: owned.length
      ? `${supervisor.name} still owns ${owned.length} project(s). Reassign them first — the server will refuse this.`
      : `${supervisor.name} will lose access. Projects they don't own are unaffected.`,
    confirmLabel: 'Delete project manager',
  });
  if (!ok) return;
  try {
    await api.deleteSupervisor(supervisor.id);
    toast('Project manager deleted');
    await refreshUsers();
  } catch (err) {
    toast(err.message, 'err');
  }
}

/**
 * Reload everything the page shows and repaint the shell.
 *
 * One refresh for both roles: the sidebar count, the tree and the supervisor cards all
 * read from these arrays, and keeping two refreshers is how the two pages drifted
 * into different copy for the same account.
 */
async function refreshUsers() {
  const [treeRes, supervisorsRes, stats, clientsRes, projectsRes] = await Promise.all([
    api.pentesters(),
    api.supervisors(),
    api.stats(),
    api.clients(),
    api.projects(currentQuery()),
  ]);
  state.pentesters = treeRes.pentesters;
  state.pentesterTree = treeRes.tree;
  state.supervisors = supervisorsRes.supervisors;
  state.stats = stats;
  state.clients = clientsRes.clients;
  state.projects = projectsRes.projects;

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.outerHTML = sidebarHTML();
  bindSidebar();
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.nav));
  mountContent();
}

/**
 * Everyone who can legally supervise a given level.
 *
 * A level's legal parents are a SET, not one level: an intern is attached to
 * whoever actually supervises them — usually a member, often the lead on a small
 * team. The label carries the level too, since "Rafi Pratama" and "Rafi Pratama
 * (lead)" are the same name but a different choice when two people share one.
 */
function managerChoices(subrole, currentParentId = null) {
  const allowed = PARENT_LEVELS[subrole];
  if (!allowed?.length) return [];
  return sortPentesters(state.pentesters)
    .filter((u) => allowed.includes(u.subrole || 'Member'))
    .map((u) => ({
      value: u.id,
      label: allowed.length > 1 ? `${u.name} · ${u.subrole.toLowerCase()}` : u.name,
      sub: u.subrole,
      selected: Number(u.id) === Number(currentParentId),
    }));
}

/* ============================================================
   Importing users
   ------------------------------------------------------------
   A team arrives as a spreadsheet, a WhatsApp list or a CSV export,
   not one modal at a time. The import takes whatever is pasted or
   uploaded, shows exactly what it parsed BEFORE writing anything,
   and then creates the rows one request at a time so a single bad
   line cannot take the other nineteen down with it.
   ============================================================ */
const IMPORT_LEVELS = {
  lead: 'Lead',
  'sub lead': 'Sub Lead',
  sublead: 'Sub Lead',
  'sub-lead': 'Sub Lead',
  sub_lead: 'Sub Lead',
  member: 'Member',
  staff: 'Member',
  // An intern row in a pasted list is the same "magang" people write in a
  // spreadsheet, so both spellings are accepted.
  intern: 'Intern',
  trainee: 'Intern',
  magang: 'Intern',
};
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** One pasted line -> its cells. Comma, semicolon or tab separated. */
function splitImportLine(line) {
  return line
    .split(/\t|\s*;\s*|\s*,\s*/)
    .map((v) => v.replace(/^"(.*)"$/, '$1').trim());
}

/** `Rafi Pratama` -> `rafi.pratama`, the username we hand out when none is given. */
function usernameFor(name) {
  const base = String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 32);
  if (base.length >= 3) return base;
  return `user.${base}`.slice(0, 32);
}

/** First free variant of a username: rafi, rafi.2, rafi.3 … */
function freeUsername(base, taken) {
  let name = base.slice(0, 32);
  let i = 2;
  while (taken.has(name)) {
    name = `${base.slice(0, 28)}.${i++}`;
  }
  taken.add(name);
  return name;
}

/**
 * Parse the pasted/uploaded list into preview rows.
 *
 * Only the name is required. A level, a phone and an email are recognised by shape
 * wherever they appear after it — `Rafi, Lead`, `Rafi, rafi, pentester123, Lead, Rafi
 * Pratama` and `Rina, +62 812 …, rina@bank.id` are all things people paste. Whatever is
 * left is positional: username, then password, then the role's own column.
 *
 * Parents are resolved HERE, against the existing tree plus the rows above, so the
 * preview can say "reports to Dewi (auto)" before a single account exists.
 */
function parseImport(text, opts = {}) {
  const isSupervisorRole = opts.role === PM_ROLE;
  const defaultLevel = opts.defaultLevel || 'Member';
  const defaultPassword = opts.password || (isSupervisorRole ? 'manager123' : 'pentester123');

  const taken = new Set(
    [
      ...(state.pentesters || []).map((u) => u.username),
      ...(state.supervisors || []).map((u) => u.username),
      ...(state.users || []).map((u) => u.username),
    ]
      .filter(Boolean)
      .map((u) => String(u).toLowerCase())
  );

  // The pool a row may report to: the people already in the tree, plus the rows
  // created above it in this list.
  const pool = (state.pentesters || []).map((u) => ({ ...u }));
  const rows = [];
  let seenFirst = false;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = splitImportLine(line);
    if (!seenFirst) {
      seenFirst = true;
      // A spreadsheet export keeps its header row; it is not a person.
      if (/^(full\s*)?name$/i.test(cells[0] || '')) continue;
    }

    const name = cells[0] || '';
    let rest = cells.slice(1);
    let level = defaultLevel;
    // Pull the level out wherever it landed, so a list without usernames still
    // carries its levels.
    const levelAt = rest.findIndex((c) => IMPORT_LEVELS[String(c).toLowerCase()]);
    if (levelAt >= 0) {
      level = IMPORT_LEVELS[String(rest[levelAt]).toLowerCase()];
      rest = rest.filter((_, i) => i !== levelAt);
    }

    let username = '';
    let password = defaultPassword;
    let reportsTo = '';
    let phone = '';
    let email = '';

    // Contact details are recognised by SHAPE, not by column. "Rina, +62 812 …, 
    // rina@bank.id" is what people paste, and reading that as username = the phone
    // number would create an account nobody can log into.
    const emailAt = rest.findIndex((c) => c.includes('@'));
    if (emailAt >= 0) {
      email = rest[emailAt];
      rest = rest.filter((_, i) => i !== emailAt);
    }
    const phoneAt = rest.findIndex((c) => /^\+?[\d][\d\s().-]{5,}$/.test(c));
    if (phoneAt >= 0) {
      phone = rest[phoneAt];
      rest = rest.filter((_, i) => i !== phoneAt);
    }

    // A parent may be named with no username/password columns in front of it —
    // `Dewi, Sub Lead, Rafi Pratama` names a person, not a login. Anything after the
    // username slot that matches somebody in the pool is read as the parent. The
    // first slot is never stolen: `Bagas Nugroho, bagas, pentester123, Member, Dewi`
    // has a username that is also a person's username, and reading it as the parent
    // shifted every remaining column by one.
    if (!isSupervisorRole) {
      const looksLikePerson = (c) =>
        Boolean(c) &&
        pool.some(
          (u) =>
            String(u.name || '').toLowerCase() === c.toLowerCase() ||
            String(u.username || '').toLowerCase() === c.toLowerCase()
        );
      const personAt = rest.findIndex(looksLikePerson);
      const alone = rest.length === 1 && personAt === 0 && !USERNAME_RE.test(rest[0].toLowerCase());
      if (personAt > 0 || alone) {
        reportsTo = rest[personAt];
        rest = rest.filter((_, i) => i !== personAt);
      } else if (rest.length === 1 && /\s/.test(rest[0])) {
        // One leftover cell with a space in it cannot be a username, so it is someone's
        // name. Reading it as the parent turns "that person does not exist" into the
        // error message instead of a baffling "invalid username".
        reportsTo = rest[0];
        rest = [];
      }
    }

    // Whatever is left is positional: Name, Username, Password, then the role's own
    // column (Reports to for a pentester, nothing for a supervisor).
    username = (rest[0] || '').toLowerCase();
    password = rest[1] || defaultPassword;
    if (!isSupervisorRole && !reportsTo) reportsTo = rest[2] || '';

    let error = '';
    if (!name) error = 'Name is required';
    else if (email && !EMAIL_RE.test(email)) error = 'That e-mail address looks wrong';
    else if (username && !USERNAME_RE.test(username)) {
      error = 'Username must be 3-32 chars: a-z 0-9 . _ -';
    } else if (String(password).length < 6) {
      error = 'Password must be at least 6 characters';
    }
    if (!username) username = usernameFor(name);
    username = freeUsername(username, taken);

    // Who this person reports to. Named explicitly, or the nearest legal parent —
    // the last one in the list, so a file written top-down builds its own tree.
    let parent = null;
    let parentNote = '';
    if (!isSupervisorRole && level !== 'Lead' && !error) {
      // Same legal-parent table the form and the server use: an intern may sit under
      // a member, a sub lead or a lead.
      const allowed = PARENT_LEVELS[level] || [];
      const expected = parentPhrase(level);
      if (reportsTo) {
        parent =
          pool.find(
            (u) =>
              String(u.name || '').toLowerCase() === reportsTo.toLowerCase() ||
              String(u.username || '').toLowerCase() === reportsTo.toLowerCase()
          ) || null;
        if (!parent) error = `No one called “${reportsTo}” to report to`;
        else if (!allowed.includes(parent.subrole)) {
          error = `${parent.name} is a ${parent.subrole}, and a ${level} must report to ${expected}`;
          parent = null;
        }
      } else {
        // The last legal parent in the file, so a list written top-down builds its
        // own tree; for an intern that is most often the member above them.
        parent = [...pool].reverse().find((u) => allowed.includes(u.subrole)) || null;
        if (parent) parentNote = 'auto';
        else error = `Nobody to report to — add a ${expected} above this line, or pick another level`;
      }
    }

    const row = {
      raw: line,
      name,
      username,
      password,
      level: isSupervisorRole ? PM_ROLE : level,
      parentName: parent ? parent.name : '',
      parentUsername: parent ? parent.username : '',
      parentNote,
      phone,
      email,
      error,
    };
    rows.push(row);
    if (!error && !isSupervisorRole) {
      pool.push({ id: `new-${rows.length}`, username, name, subrole: level, role: 'Pentester' });
    }
  }

  return rows;
}

/** The parse result as a table: what will be created, and what cannot be. */
function importPreviewHTML(rows, isSupervisorRole) {
  if (!rows.length) {
    return `<p class="form-hint">Nothing parsed yet — paste a list above or choose a file.</p>`;
  }
  // Contact is ONE column for both roles. Two columns pushed the pentester preview
  // past the dialog's width, and a preview that has to be scrolled sideways is not a
  // preview; the pair reads fine on one line and says what was picked up.
  // No `#` column: the row number is not referenced anywhere in the errors (they name
  // the person), and dropping it is what leaves room for Status to stay on screen
  // instead of hiding behind a horizontal scroll.
  const head = isSupervisorRole
    ? ['Name', 'Username', 'Password', 'Contact', 'Status']
    : ['Name', 'Username', 'Level', 'Reports to', 'Contact', 'Status'];

  const contact = (r) => [r.phone, r.email].filter(Boolean).join(' · ') || '—';

  return `<div class="dev-tablewrap imp-preview">
      <table class="dev-table">
        <thead><tr>${head
          .map((x) => `<th><span class="dev-h-inner"><span class="dev-h-label">${h(x)}</span></span></th>`)
          .join('')}</tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
            <td class="dev-name imp-name" title="${h(r.name || '')}">${h(r.name || '—')}</td>
            <td class="dev-mono-cell">${h(r.username || '—')}</td>
            ${
              isSupervisorRole
                ? `<td class="dev-mono-cell">${h(r.password)}</td>`
                : `<td class="dev-mono-cell">${h(r.level)}</td>
                   <td class="dev-mono-cell">${
                     r.parentName ? `${h(r.parentName)}${r.parentNote ? ' (auto)' : ''}` : '—'
                   }</td>`
            }
            <td class="dev-mono-cell imp-contact" title="${h(contact(r))}">${h(contact(r))}</td>
            <td class="dev-notes ${r.error ? 'imp-bad' : 'imp-ok'}">${h(r.error || 'Ready')}</td>
          </tr>`
          )
          .join('')}</tbody>
      </table>
    </div>`;
}

/**
 * Import users from a pasted list or a file.
 *
 * Writes happen one row at a time through the same endpoints the single-person form
 * uses, so a duplicate username is a per-row message rather than a failed batch, and
 * the server's validation stays the only validation.
 */
function openUserImport() {
  openModal({
    title: 'Import users',
    subtitle: 'Paste a list or choose a file — one person per line',
    // The preview is a seven-column table; at the normal modal width every cell
    // wrapped mid-word ("rina.kusum / a"), which is unreadable and hides exactly the
    // thing the preview exists to show.
    xwide: true,
    body: `
      <div class="field">
        <label class="label">Import as</label>
        ${segmented('imp-role', ['Pentesters', 'Project managers'], 'Pentesters')}
      </div>
      <div class="form-row">
        <div class="field" id="imp-level-field">
          <label class="label">Level for rows without one</label>
          ${segmented('imp-level', ENUMS.subrole, 'Member', { Lead: 'violet', 'Sub Lead': 'blue', Member: 'slate' })}
        </div>
        <div class="field">
          <label class="label" for="imp-pass">Default password</label>
          <input class="input" id="imp-pass" value="pentester123" />
          <span class="form-hint">Used for rows that do not name one. Minimum 6 characters.</span>
        </div>
      </div>
      <div class="field">
        <label class="label" for="imp-text">List</label>
        <textarea class="textarea code" id="imp-text" rows="7" spellcheck="false"
          placeholder="Rafi Pratama
Dewi Lestari, dewi, pentester123, Sub Lead, Rafi Pratama
Bagas Nugroho, Lead"></textarea>
        <span class="form-hint" id="imp-hint"></span>
      </div>
      <div class="imp-file-row">
        <input type="file" id="imp-file" accept=".csv,.tsv,.txt,text/plain,text/csv" hidden />
        <button type="button" class="btn btn-sm" data-imp-file>${icon.fileText(13)} Choose a file…</button>
        <span class="form-hint" id="imp-file-name"></span>
      </div>
      <div id="imp-failures"></div>
      <div id="imp-preview"></div>`,
    footer: `<span class="imp-tally" id="imp-tally"></span>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-import disabled>Import</button>`,
    onMount: (modal, close) => {
      const text = modal.querySelector('#imp-text');
      const pass = modal.querySelector('#imp-pass');
      const fileInput = modal.querySelector('#imp-file');
      const failures = modal.querySelector('#imp-failures');
      const preview = modal.querySelector('#imp-preview');
      const tally = modal.querySelector('#imp-tally');
      const go = modal.querySelector('[data-import]');
      const fileName = modal.querySelector('#imp-file-name');
      let passTouched = false;

      pass.addEventListener('input', () => {
        passTouched = true;
      });

      const isSupervisorRole = () => segmentedValue(modal, 'imp-role') === 'Project managers';
      const rowsNow = () =>
        parseImport(text.value, {
          role: isSupervisorRole() ? PM_ROLE : 'Pentester',
          defaultLevel: isSupervisorRole() ? 'Member' : segmentedValue(modal, 'imp-level') || 'Member',
          password: pass.value,
        });

      const render = () => {
        modal.querySelector('#imp-level-field').hidden = isSupervisorRole();
        modal.querySelector('#imp-hint').textContent = isSupervisorRole()
          ? 'One project manager per line. Only the full name is required — a username and password are generated when you leave them out, and phone / email are recognised wherever they sit.'
          : 'One pentester per line. Only the full name is required — a username and password are generated when you leave them out. Put the level (Lead / Sub Lead / Member), who they report to, and their phone / e-mail anywhere after the name.';
        const rows = rowsNow();
        preview.innerHTML = importPreviewHTML(rows, isSupervisorRole());
        const ok = rows.filter((r) => !r.error).length;
        const bad = rows.length - ok;
        tally.textContent = rows.length
          ? `${ok} ready${bad ? `, ${bad} with problems` : ''}`
          : '';
        go.disabled = ok === 0;
        go.textContent = ok ? `Import ${ok} user${ok === 1 ? '' : 's'}` : 'Import';
        if (rows.length) failures.innerHTML = '';
      };

      bindSegmented(modal, 'imp-role', (value) => {
        const pm = value === 'Project managers';
        // The default password follows the role, unless it was typed.
        if (!passTouched) pass.value = pm ? 'manager123' : 'pentester123';
        render();
      });
      bindSegmented(modal, 'imp-level', render);
      text.addEventListener('input', render);
      pass.addEventListener('input', render);

      modal.querySelector('[data-imp-file]').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        fileName.textContent = file.name;
        text.value = await file.text();
        render();
      });

      modal.querySelector('[data-cancel]').addEventListener('click', close);

      go.addEventListener('click', async () => {
        const pm = isSupervisorRole();
        const rows = rowsNow().filter((r) => !r.error);
        if (!rows.length) return;
        // People created in this run join the pool, so a member further down the
        // list can report to a sub lead created three lines above them.
        const pool = [...(state.pentesters || [])];
        const created = [];
        const failed = [];

        go.disabled = true;
        go.textContent = 'Importing…';
        for (const row of rows) {
          try {
            const payload = {
              name: row.name,
              username: row.username,
              password: row.password,
              phone: row.phone,
              email: row.email,
            };
            if (!pm) {
              payload.subrole = row.level;
              if (row.level === 'Lead') {
                payload.parentId = null;
              } else {
                const parent = pool.find(
                  (u) => String(u.username).toLowerCase() === row.parentUsername.toLowerCase()
                );
                if (!parent) throw new Error('The person they report to is not in the tree yet');
                payload.parentId = parent.id;
              }
            }
            const res = pm ? await api.createSupervisor(payload) : await api.createPentester(payload);
            const person = res.supervisor || res.pentester;
            if (person) pool.push({ ...person, subrole: person.subrole || row.level });
            created.push(row.username);
          } catch (err) {
            failed.push(`${row.name} (${row.username}): ${err.message}`);
          }
        }

        if (created.length) await refreshUsers();
        if (!failed.length) {
          toast(`${created.length} user${created.length === 1 ? '' : 's'} imported`);
          close();
          return;
        }

        // Leave the dialog holding ONLY the lines that did not make it. The ones
        // that did are now accounts on the server, so leaving them in the box would
        // mean a second click creates them again under a suffixed username.
        text.value = rows.filter((r) => failed.some((f) => f.startsWith(`${r.name} (`))).map((r) => r.raw).join('\n');
        toast(`${created.length} imported, ${failed.length} failed`, 'err');
        render();
        failures.innerHTML = `<div class="callout imp-failures">
            <span><strong>${failed.length} could not be created</strong></span>
            <ul>${failed.map((f) => `<li>${h(f)}</li>`).join('')}</ul>
          </div>`;
      });

      render();
    },
  });
}



/* ============================================================
   Import — the catalogue and the hardware inventory
   ============================================================
   The user import answers "a team arrives as a list". These two
   answer the same thing for the other two things that arrive as a
   list: a new client with its applications, and a box of devices
   with serials. Same shape as the user import — parse into a
   preview table, then write row by row so one bad line cannot take
   the rest down with it. */

/** `Bank Nusantara (BN)` -> name + short name. */
function splitClientName(value) {
  const text = String(value || '').trim();
  const paren = text.match(/^(.*?)\s*\(([^)]{1,12})\)$/);
  if (paren && paren[1].trim()) return { name: paren[1].trim(), shortName: paren[2].trim() };
  return { name: text, shortName: '' };
}

/**
 * Parse a pasted client list.
 *
 * Only the client name is required. A short name can be written either in
 * parentheses after the name (`Bank Nusantara (BN)`) or as its own short cell;
 * applications go in a cell separated by `/` or `|` (`Mobile Banking / Internet
 * Banking`), which is the one convention that survives a spreadsheet column;
 * everything else becomes the client's notes.
 */
function parseClientImport(text) {
  const existing = new Set((state.clients || []).map((c) => String(c.name || '').toLowerCase()));
  const seen = new Set();
  const rows = [];
  let first = true;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = splitImportLine(line);
    if (first) {
      first = false;
      // A spreadsheet export keeps its header row; it is not a client.
      if (/^(client\s*)?name$/i.test(cells[0] || '')) continue;
    }

    const split = splitClientName(cells[0]);
    let rest = cells.slice(1);
    let apps = [];
    let notes = '';

    // Applications first: the cell that carries them is the only one with a
    // separator, and a short name never contains `/`.
    const appAt = rest.findIndex((c) => /[/|]/.test(c));
    if (appAt >= 0) {
      apps = rest[appAt]
        .split(/[/|]/)
        .map((a) => a.trim())
        .filter(Boolean);
      rest = rest.filter((_, i) => i !== appAt);
    }

    let shortName = split.shortName;
    if (!shortName) {
      // A short name is short and has no spaces; anything longer is prose.
      const shortAt = rest.findIndex((c) => c && c.length <= 12 && !/\s/.test(c));
      if (shortAt >= 0) {
        shortName = rest[shortAt];
        rest = rest.filter((_, i) => i !== shortAt);
      }
    }
    notes = rest.filter(Boolean).join(' · ');

    const name = split.name;
    let error = '';
    if (!name) error = 'No client name';
    else if (existing.has(name.toLowerCase())) error = 'Already in the catalogue';
    else if (seen.has(name.toLowerCase())) error = 'Listed twice';
    if (name) seen.add(name.toLowerCase());

    rows.push({
      raw: line,
      name,
      shortName: shortName ? shortName.slice(0, 12) : '',
      apps: [...new Set(apps.map((a) => a.toLowerCase()))].map(
        (lower) => apps.find((a) => a.toLowerCase() === lower) || lower
      ),
      notes,
      error,
    });
  }
  return rows;
}

/**
 * Preview header cells. `cls` travels with the label so a column that is dropped on
 * a narrow screen disappears as a WHOLE column — hiding only its body cells left the
 * header behind and shifted every value one column to the left.
 */
function impHead(cells) {
  return cells
    .map(
      ([label, cls]) =>
        `<th${cls ? ` class="${cls}"` : ''}><span class="dev-h-inner"><span class="dev-h-label">${h(label)}</span></span></th>`
    )
    .join('');
}

/** The client parse result as a table. */
function clientImportPreviewHTML(rows) {
  if (!rows.length) {
    return `<p class="form-hint">Nothing parsed yet — paste a list above or choose a file.</p>`;
  }
  const head = [
    ['Name'],
    ['Short name'],
    ['Applications', 'imp-hide-sm'],
    ['Notes', 'imp-hide-sm'],
    ['Status'],
  ];
  return `<div class="dev-tablewrap imp-preview">
      <table class="dev-table">
        <thead><tr>${impHead(head)}</tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
            <td class="dev-name imp-name" title="${h(r.name || '')}">${h(r.name || '—')}</td>
            <td class="dev-mono-cell">${h(r.shortName || '—')}</td>
            <td class="dev-notes imp-details imp-hide-sm" title="${h(r.apps.join(', '))}">${
              r.apps.length ? h(r.apps.join(' · ')) : '—'
            }</td>
            <td class="dev-notes imp-details imp-hide-sm" title="${h(r.notes || '')}">${h(r.notes || '—')}</td>
            <td class="dev-notes ${r.error ? 'imp-bad' : 'imp-ok'}">${h(r.error || 'Ready')}</td>
          </tr>`
          )
          .join('')}</tbody>
      </table>
    </div>`;
}

/**
 * Import clients (and their applications) from a pasted list or a file.
 *
 * Applications are created after their client, one request at a time, and a
 * failed application is reported without losing the client that owns it — the
 * client is the thing the rest of the app needs.
 */
function openClientImport() {
  openModal({
    title: 'Import clients',
    subtitle: 'Paste a list or choose a file — one client per line',
    xwide: true,
    body: `
      <div class="field">
        <label class="label" for="imp-clients">List</label>
        <textarea class="textarea code" id="imp-clients" rows="8" spellcheck="false"
          placeholder="Bank Nusantara (BN)
Bank Mandiri; BM; Mobile Banking / Internet Banking
SecurePay Devices;;;Payment terminals, EDC supplier
Bluewave Finance; BF; Paylater App;;Jakarta, contact: Ops"></textarea>
        <span class="form-hint">
          Only the client name is required. A short name can follow in parentheses or as
          its own cell; a cell separated by <code>/</code> becomes that client's
          applications; anything else becomes notes.
        </span>
      </div>
      <div class="imp-file-row">
        <input type="file" id="imp-client-file" accept=".csv,.tsv,.txt,text/plain,text/csv" hidden />
        <button type="button" class="btn btn-sm" data-imp-file>${icon.fileText(13)} Choose a file…</button>
        <span class="form-hint" id="imp-client-file-name"></span>
      </div>
      <div id="imp-client-failures"></div>
      <div id="imp-client-preview"></div>`,
    footer: `<span class="imp-tally" id="imp-client-tally"></span>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-import disabled>Import</button>`,
    onMount: (modal, close) => {
      const text = modal.querySelector('#imp-clients');
      const preview = modal.querySelector('#imp-client-preview');
      const tally = modal.querySelector('#imp-client-tally');
      const failures = modal.querySelector('#imp-client-failures');
      const fileName = modal.querySelector('#imp-client-file-name');
      const fileInput = modal.querySelector('#imp-client-file');
      const go = modal.querySelector('[data-import]');

      const render = () => {
        const rows = parseClientImport(text.value);
        preview.innerHTML = clientImportPreviewHTML(rows);
        const ok = rows.filter((r) => !r.error);
        const bad = rows.length - ok.length;
        const apps = ok.reduce((n, r) => n + r.apps.length, 0);
        tally.textContent = rows.length
          ? `${ok.length} ready${apps ? ` (+${apps} app${apps === 1 ? '' : 's'})` : ''}${
              bad ? `, ${bad} skipped` : ''
            }`
          : '';
        go.disabled = ok.length === 0;
        go.textContent = ok.length ? `Import ${ok.length} client${ok.length === 1 ? '' : 's'}` : 'Import';
        if (rows.length) failures.innerHTML = '';
      };

      text.addEventListener('input', render);
      modal.querySelector('[data-imp-file]').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        fileName.textContent = file.name;
        text.value = await file.text();
        render();
      });
      modal.querySelector('[data-cancel]').addEventListener('click', close);

      go.addEventListener('click', async () => {
        const rows = parseClientImport(text.value).filter((r) => !r.error);
        if (!rows.length) return;
        go.disabled = true;
        go.textContent = 'Importing…';
        const failed = [];
        let createdClients = 0;
        let createdApps = 0;

        for (const row of rows) {
          let client;
          try {
            const res = await api.createClient({
              name: row.name,
              shortName: row.shortName,
              notes: row.notes,
            });
            client = res.client;
            createdClients += 1;
          } catch (err) {
            failed.push(`${row.name}: ${err.message}`);
            continue;
          }
          for (const app of row.apps) {
            try {
              await api.createApplication({ clientId: client.id, name: app });
              createdApps += 1;
            } catch (err) {
              // The client exists; only its application did not. Name both, so the
              // message says what to do rather than just what broke.
              failed.push(`${row.name} → ${app}: ${err.message}`);
            }
          }
        }

        await Promise.all([refreshCatalog(), refreshAll()]);
        if (!failed.length) {
          toast(
            `${createdClients} client${createdClients === 1 ? '' : 's'} imported${
              createdApps ? ` with ${createdApps} application${createdApps === 1 ? '' : 's'}` : ''
            }`
          );
          close();
          return;
        }
        text.value = rows
          .filter((r) => failed.some((f) => f.startsWith(`${r.name}:`) || f.startsWith(`${r.name} →`)))
          .map((r) => r.raw)
          .join('\n');
        toast(`${createdClients} imported, ${failed.length} failed`, 'err');
        render();
        failures.innerHTML = `<div class="callout imp-failures">
            <span><strong>${failed.length} could not be created</strong></span>
            <ul>${failed.map((f) => `<li>${h(f)}</li>`).join('')}</ul>
          </div>`;
      });

      render();
    },
  });
}

/* ---- devices ------------------------------------------------------------ */

/** Normalise a header cell: `Name Device` and `name_device` both become `namedevice`. */
function headerKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Map a header row onto the kind's fields, or null when the row is not a header.
 *
 * A spreadsheet export carries its column names, and those are free ordering
 * information: if two or more cells name fields, trust the labels instead of
 * asking the operator to reorder their file. Below two matches it is far more
 * likely to be a device whose values happen to match a label.
 */
function deviceHeaderMap(cells, fields, labels) {
  const lookup = new Map();
  for (const key of fields) {
    lookup.set(headerKey(key), key);
    lookup.set(headerKey(labels[key] || key), key);
  }
  // Common spellings a spreadsheet invents for these columns.
  const alias = {
    namedevice: 'name',
    device: 'name',
    devicename: 'name',
    uniqueid: 'serial',
    sn: 'serial',
    who: 'whoUsed',
    whohas: 'whoUsed',
    owner: 'whoUsed',
    type: 'edcType',
    edctype: 'edcType',
    notes: 'notes',
    note: 'notes',
  };
  const map = cells.map((cell) => lookup.get(headerKey(cell)) || alias[headerKey(cell)] || null);
  const hits = map.filter((key) => key && fields.includes(key)).length;
  return hits >= 2 ? map : null;
}

/**
 * Parse a pasted device list for one kind.
 *
 * Two shapes are accepted, because both arrive in practice: a file exported with
 * its header row (mapped by label, in any order) and a bare list (read
 * positionally in the kind's field order, starting with the device name). Cells
 * past the last field are appended to notes rather than dropped — an extra column
 * in someone's sheet is still information.
 */
function parseDeviceImport(text, kind) {
  const fields = state.deviceFields[kind] || [];
  const labels = state.deviceLabels || {};
  const rows = [];
  let header = null;
  let first = true;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = splitImportLine(line);
    if (first) {
      first = false;
      const map = deviceHeaderMap(cells, fields, labels);
      if (map) {
        header = map;
        continue;
      }
    }

    const values = {};
    if (header) {
      cells.forEach((cell, i) => {
        const key = header[i];
        if (key) values[key] = cell;
      });
    } else {
      fields.forEach((key, i) => {
        values[key] = cells[i] ?? '';
      });
      const extra = cells.slice(fields.length).filter(Boolean);
      if (extra.length) {
        values.notes = [values.notes, ...extra].filter(Boolean).join(' — ');
      }
    }

    const name = String(values.name || '').trim();
    let error = '';
    if (!name) error = 'No device name';
    rows.push({ raw: line, kind, name, values, error });
  }
  return rows;
}

/** A compact summary of everything the row carries besides its name. */
function deviceImportDetails(row) {
  const labels = state.deviceLabels || {};
  const parts = [];
  for (const key of state.deviceFields[row.kind] || []) {
    if (key === 'name') continue;
    const value = String(row.values[key] ?? '').trim();
    if (!value) continue;
    // Notes hold sentences; the label would only repeat the name of the column.
    parts.push(key === 'notes' ? value : `${labels[key] || key}: ${value}`);
  }
  return parts.join(' · ') || '—';
}

function deviceImportPreviewHTML(rows) {
  if (!rows.length) {
    return `<p class="form-hint">Nothing parsed yet — paste a list above or choose a file.</p>`;
  }
  const head = [['Name device'], ['Details', 'imp-hide-sm'], ['Status']];
  return `<div class="dev-tablewrap imp-preview">
      <table class="dev-table">
        <thead><tr>${impHead(head)}</tr></thead>
        <tbody>${rows
          .map((r) => {
            const details = deviceImportDetails(r);
            return `<tr>
            <td class="dev-name imp-name" title="${h(r.name || '')}">${h(r.name || '—')}</td>
            <td class="dev-notes imp-details imp-hide-sm" title="${h(details)}">${h(details)}</td>
            <td class="dev-notes ${r.error ? 'imp-bad' : 'imp-ok'}">${h(r.error || 'Ready')}</td>
          </tr>`;
          })
          .join('')}</tbody>
      </table>
    </div>`;
}

/**
 * Import devices of one type from a pasted list or a file.
 *
 * The type is chosen in the dialog rather than read from the file: the kind
 * decides which columns exist, and guessing it from the data would be wrong
 * exactly when it matters (an EDC and a Misc row both start with a name).
 */
function openDeviceImport() {
  const startKind = state.deviceKinds.includes(state.deviceKind) ? state.deviceKind : state.deviceKinds[0];
  const fieldList = (kind) => (state.deviceFields[kind] || []).map((k) => state.deviceLabels[k] || k);
  openModal({
    title: 'Import devices',
    subtitle: 'Paste a list or choose a file — one device per line',
    xwide: true,
    body: `
      <div class="field">
        <label class="label">Type</label>
        ${segmented(
          'imp-kind',
          state.deviceKinds.map((k) => ({ value: k, label: DEVICE_KIND[k]?.label || k })),
          startKind,
          { Android: 'green', iOS: 'slate', EDC: 'amber', Misc: 'violet' }
        )}
        <span class="form-hint" id="imp-kind-hint"></span>
      </div>
      <div class="field">
        <label class="label" for="imp-devices">List</label>
        <textarea class="textarea code" id="imp-devices" rows="8" spellcheck="false"></textarea>
        <span class="form-hint" id="imp-device-hint"></span>
      </div>
      <div class="imp-file-row">
        <input type="file" id="imp-device-file" accept=".csv,.tsv,.txt,text/plain,text/csv" hidden />
        <button type="button" class="btn btn-sm" data-imp-file>${icon.fileText(13)} Choose a file…</button>
        <span class="form-hint" id="imp-device-file-name"></span>
      </div>
      <div id="imp-device-failures"></div>
      <div id="imp-device-preview"></div>`,
    footer: `<span class="imp-tally" id="imp-device-tally"></span>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-import disabled>Import</button>`,
    onMount: (modal, close) => {
      const text = modal.querySelector('#imp-devices');
      const preview = modal.querySelector('#imp-device-preview');
      const tally = modal.querySelector('#imp-device-tally');
      const failures = modal.querySelector('#imp-device-failures');
      const fileName = modal.querySelector('#imp-device-file-name');
      const fileInput = modal.querySelector('#imp-device-file');
      const go = modal.querySelector('[data-import]');

      const kindNow = () => segmentedValue(modal, 'imp-kind') || startKind;

      const render = () => {
        const kind = kindNow();
        modal.querySelector('#imp-kind-hint').textContent = `${kind}: ${fieldList(kind).join(' · ')}`;
        modal.querySelector('#imp-device-hint').textContent =
          'Only the device name is required. Columns are read in that order, unless the first line names them — a spreadsheet header is matched by label, in any order.';
        const rows = parseDeviceImport(text.value, kind);
        preview.innerHTML = deviceImportPreviewHTML(rows);
        const ok = rows.filter((r) => !r.error).length;
        tally.textContent = rows.length ? `${ok} ready${rows.length - ok ? `, ${rows.length - ok} with problems` : ''}` : '';
        go.disabled = ok === 0;
        go.textContent = ok ? `Import ${ok} device${ok === 1 ? '' : 's'}` : 'Import';
        if (rows.length) failures.innerHTML = '';
      };

      bindSegmented(modal, 'imp-kind', render);
      text.addEventListener('input', render);
      modal.querySelector('[data-imp-file]').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        fileName.textContent = file.name;
        text.value = await file.text();
        render();
      });
      modal.querySelector('[data-cancel]').addEventListener('click', close);

      go.addEventListener('click', async () => {
        const kind = kindNow();
        const rows = parseDeviceImport(text.value, kind).filter((r) => !r.error);
        if (!rows.length) return;
        go.disabled = true;
        go.textContent = 'Importing…';
        const failed = [];
        let created = 0;

        for (const row of rows) {
          try {
            // Only the kind's own fields: the endpoint ignores the rest, but sending
            // them would make a typo look like a supported column.
            const payload = { kind };
            for (const key of state.deviceFields[kind] || []) {
              if (row.values[key] !== undefined) payload[key] = row.values[key];
            }
            await api.createDevice(payload);
            created += 1;
          } catch (err) {
            failed.push(`${row.name}: ${err.message}`);
          }
        }

        await loadDevices();
        if (!failed.length) {
          toast(`${created} device${created === 1 ? '' : 's'} imported`);
          close();
          return;
        }
        text.value = rows
          .filter((r) => failed.some((f) => f.startsWith(`${r.name}:`)))
          .map((r) => r.raw)
          .join('\n');
        toast(`${created} imported, ${failed.length} failed`, 'err');
        render();
        failures.innerHTML = `<div class="callout imp-failures">
            <span><strong>${failed.length} could not be created</strong></span>
            <ul>${failed.map((f) => `<li>${h(f)}</li>`).join('')}</ul>
          </div>`;
      });

      render();
    },
  });
}

/* ============================================================
   boot
   ============================================================ */
onUnauthorized(() => {
  state.user = null;
  renderAuth('login');
});

async function boot() {
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

boot();
