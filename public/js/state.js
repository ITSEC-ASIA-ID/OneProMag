import { propList } from './props.js';


export const root = document.getElementById('root');


export const ENUMS = {
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
export const statusTones = () => Object.fromEntries(propList('status').map((p) => [p.key, p.tone]));

export const METHOD_TONE = { 'Black Box': 'rose', 'Grey Box': 'amber', 'White Box': 'green' };


/**
 * A nav id remembered by an older build may name a page this build no longer has:
 * Pentesters and project managers were merged into one Users page. Without this the
 * shell would boot on an id with no NAV entry and fall back to Active projects.
 */
export function normalizeNav(id) {
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
export const ADMIN_NAV = new Set(['clients', 'users', 'properties']);


export function navAllowed(id) {
  return !ADMIN_NAV.has(id) || canManageCatalog();
}


/**
 * Workspace navigation. `prod` is intentionally gone; `active` is the
 * "everything except Done" view, `queue` is the client-retest queue.
 */
export const NAV = {
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


export const state = {
  user: null,
  // Who the server says was around in the last couple of minutes. Refreshed by
  // the topbar badge, which also counts as the "I am here" ping.
  online: [],
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
export function canManageCatalog() {
  const u = state.user;
  if (!u) return false;
  return u.role === 'Admin' || u.subrole === 'Lead' || u.subrole === 'Sub Lead';
}
