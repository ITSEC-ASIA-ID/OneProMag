import { openProject } from './drawer.js';
import { state } from './state.js';
import { api } from './api.js';
import { escapeHtml as h, openModal, personCardHTML, toast } from './ui.js';


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
export function placeMenu(menu, toggle) {
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
export function hideMenu(menu) {
  menu.hidden = true;
  menu.style.top = '';
  menu.style.left = '';
  const home = menu._qsHome;
  if (home && home.isConnected && menu.parentElement === document.body) {
    home.appendChild(menu);
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
export async function openPerson(id, opts = {}) {
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


export const PAGE_SIZES = [50, 100, 200, 0];


/**
 * The slice of rows the current page shows, and the bookkeeping the pager needs.
 *
 * Paging is applied to the ROWS, not to the projects: a page of 50 means fifty
 * lines of work, retest rows included, which is what the operator counts when
 * they scroll. `0` in the size picker means "all" and is kept as an explicit
 * choice rather than a magic large number.
 */
export function pageSlice(rows) {
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
export function pagerHTML({ total, page, pages, from, size }) {
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
export const loadSeq = new Map();


export function nextLoadToken(key) {
  const token = (loadSeq.get(key) || 0) + 1;
  loadSeq.set(key, token);
  return token;
}


export function isCurrentLoad(key, token) {
  return loadSeq.get(key) === token;
}


/** Translates the current nav + filters into API query parameters. */
export function currentQuery() {
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


/* ============================================================
   data
   ============================================================ */
export async function refreshCatalog() {
  const [clientsRes, appsRes] = await Promise.all([api.clients(), api.applications()]);
  state.clients = clientsRes.clients;
  state.applications = appsRes.applications;
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
export const USER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'pentesters', label: 'Pentesters' },
  { id: 'supervisors', label: 'Project managers' },
];

/**
 * The account type that owns engagements. The PROJECT FIELD is called Supervisor
 * (SV) and accepts a PM or a pentester; this constant is the role itself, and the
 * role is still called Project Manager.
 */
export const PM_ROLE = 'Project Manager';


/** Clients as combobox items (label = full client name). */
export function clientItems() {
  return state.clients.map((c) => ({ value: c.id, label: c.name, sub: c.shortName || '' }));
}


/**
 * Supervisors a client names as its usual owners.
 * Used to pre-select the SV when the client is picked in the project form.
 * Returns the raw client row so the caller can read `supervisors`.
 */
export function clientById(clientId) {
  return state.clients.find((c) => Number(c.id) === Number(clientId)) || null;
}


/**
 * The people who may supervise, as combobox items.
 *
 * The pool mixes two hats now — a dedicated Supervisor account and a pentester who
 * runs an engagement — so each row says which one it is. Without that, "Rafi
 * Pratama" appearing in a supervisor list next to "Rina Kusuma" looks like a bug.
 */
export function supervisorItems() {
  return (state.supervisors || []).map((m) => ({
    value: m.id,
    label: m.name,
    sub: m.role === PM_ROLE ? 'Project Manager' : 'Pentester',
  }));
}


/** Applications for one client as combobox items. */
export function applicationItems(clientId) {
  const id = Number(clientId);
  if (!id) return [];
  return state.applications
    .filter((a) => Number(a.clientId) === id)
    .map((a) => ({ value: a.id, label: a.name, sub: '' }));
}


/** The variants of one application, for the project form's third picker. */
export function variantItems(applicationId) {
  const id = Number(applicationId);
  if (!id) return [];
  const app = state.applications.find((a) => Number(a.id) === id);
  return (app?.variants || []).map((v) => ({ value: v.id, label: v.name }));
}


export function applicationOptions(clientId, selectedId, placeholder) {
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


export function variantSelectOptions(applicationId, selectedId = '') {
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
export function variantDetailHTML(applicationId, variantId) {
  const variant = findVariant(variantId);
  if (!variant || !variant.notes) return '';
  return `${h(variant.name)} — ${h(variant.notes)}`;
}


/** Variants live inside their application in state.applications, not in a flat list. */
export function findVariant(id) {
  const wanted = Number(id);
  for (const app of state.applications) {
    const hit = (app.variants || []).find((v) => Number(v.id) === wanted);
    if (hit) return hit;
  }
  return null;
}


/** Name of the thing a row represents: the project, or the retest of it. */
export function rowLabel(row) {
  return row.kind === 'retest' ? `Retest - ${row.project.name}` : row.project.name;
}
