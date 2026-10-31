import { openProject } from './drawer.js';
import { mountContent } from './projects.js';
import { isCurrentLoad, nextLoadToken, openPerson } from './shared.js';
import { canManageCatalog, state } from './state.js';
import { api } from './api.js';
import { AVAILABILITY, icon } from './icons.js';
import { propLabel, propTone } from './props.js';
import {
  availabilityBadge, avatar, daysSince, fmtDate,
  escapeHtml as h, openModal, subroleBadge, toast,
} from './ui.js';


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
export const AVAIL_STATUSES = ['On Project', 'Idle', 'Leave', 'Exam', 'Research/Learning', 'Other'];

export const AVAIL_MANUAL = ['Leave', 'Exam', 'Research/Learning', 'Other'];


/**
 * Who may change a given row. Mirrors canEditAvailability() on the server:
 * Admin / Lead / Sub Lead may edit anybody, a Member only their own row.
 */
export function canEditRow(person) {
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
export function boardMatches(p) {
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
export function boardRows() {
  return (state.board || []).filter(boardMatches);
}


/**
 * The board is two tables, not one: the bench (leads, sub leads, members) and the
 * interns. An intern is a person learning the job, so mixing them into the tree
 * would put a trainee beside the people they are being trained by and make "who is
 * on the bench" answerable only by reading every level pill.
 */
export function boardPentesters() {
  return boardRows().filter((r) => r.subrole !== 'Intern');
}


export function boardInterns() {
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
export function boardNameById(id) {
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
export const BOARD_DEPTH = { Lead: 0, 'Sub Lead': 1, Member: 2 };


export function boardChipHTML(kind, pr) {
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


export function boardRowHTML(p, opts = {}) {
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
export function boardEmptyHTML(kind = 'pentesters') {
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


export function boardTableHTML(rows = boardPentesters(), opts = {}) {
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
export function boardCountHTML() {
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
export function boardSummaryHTML() {
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


export function teamHTML() {
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
export function boardSectionsHTML() {
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
export function repaintBoard() {
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


export async function loadBoard() {
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


export function bindTeam() {
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
export let boardMenu = null;


export function closeBoardMenu() {
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

export function boardMenuOutside(e) {
  if (!boardMenu) return;
  if (e.target.closest('[data-avail-menu]') || e.target.closest('[data-avail-open]')) return;
  closeBoardMenu();
}

export function boardMenuEscape(e) {
  if (e.key === 'Escape') closeBoardMenu();
}


export function openAvailabilityMenu(person, toggle) {
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


export function openAvailabilityNote(person) {
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


export async function saveAvailability(person, payload, opts = {}) {
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
export let assignMenu = null;


export function closeAssignMenu() {
  document.removeEventListener('mousedown', onAssignOutside, true);
  document.removeEventListener('keydown', onAssignEscape, true);
  if (!assignMenu) return;
  assignMenu.remove();
  assignMenu = null;
}


export function onAssignOutside(e) {
  if (!assignMenu) return;
  if (e.target.closest('[data-assign-menu]') || e.target.closest('[data-assign-open]')) return;
  closeAssignMenu();
}


export function onAssignEscape(e) {
  if (e.key === 'Escape' && assignMenu) {
    e.stopPropagation();
    closeAssignMenu();
  }
}


export async function openAssignMenu(person, toggle) {
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
