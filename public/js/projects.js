import { adminHTML, bindAdmin } from './admin.js';
import { bindDevices, devicesHTML } from './devices.js';
import { bindDirectory, directoryHTML } from './directory.js';
import { openProject, openTeamForm, renderDrawer } from './drawer.js';
import { bindDocs, bindInfo, infoHTML } from './info.js';
import { bindProperties, propertiesHTML } from './properties.js';
import {
  applicationItems, applicationOptions, clientItems, currentQuery,
  hideMenu, isCurrentLoad, nextLoadToken, openPerson,
  pageSlice, pagerHTML, placeMenu, rowLabel,
  supervisorItems, variantDetailHTML, variantItems, variantSelectOptions,
} from './shared.js';
import { loadStats, setTitle, statsHTML } from './shell.js';
import { ENUMS, METHOD_TONE, NAV, state, statusTones } from './state.js';
import { bindTeam, teamHTML } from './team.js';
import {
  autoPickSupervisor, bindPicker, bindUsers, pentesterPickerHTML,
  pickerValues, usersHTML,
} from './users.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { propOptions } from './props.js';
import {
  avatar, bindCombobox, bindSegmented, catBadge,
  catIcon, combobox, confirmDialog, envBadge,
  escapeHtml as h, methodBadge, openModal, quickStatus,
  segmented, segmentedValue, setComboboxItems, supervisorCell,
  teamCell, toast,
} from './ui.js';


export function filtersHTML() {
  const f = state.filters;
  return `
    <div class="filters">
      <div class="search">
        ${icon.search()}
        <input class="input" id="filter-q" placeholder="Filter by name, client, app or notes…" value="${h(f.q)}" autocomplete="off" />
        <button class="search-clear" id="filter-clear" aria-label="Clear the filter" ${f.q ? '' : 'hidden'}>
          ${icon.x(13)}
        </button>
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
      <div class="toggle-group ml-auto">
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
export const STATUS_RANK = { Ongoing: 0, Incoming: 1, Ready: 2, Hold: 3, Done: 4 };


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
export function listRows(list) {
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


/**
 * Deleting a retest request is a delete, so the server asks for admin / lead /
 * sub lead. One flow for both places that offer it (the list row and the drawer),
 * because two copies of the same confirm text drift apart within a release.
 */
export async function deleteRetestFlow(retest, { onDone } = {}) {
  if (!retest) return;
  const ok = await confirmDialog({
    title: 'Delete retest request?',
    message: `"${retest.title}" (${retest.code}) will be removed from the queue.`,
    confirmLabel: 'Delete request',
  });
  if (!ok) return;
  try {
    await api.deleteRetest(retest.id);
    toast('Retest request deleted');
    await refreshAll();
    if (onDone) await onDone();
  } catch (err) {
    toast(err.message, 'err');
  }
}


export function projectCardHTML(row) {
  const p = row.project;
  const isRetest = row.kind === 'retest';
  // A category the admin added has no palette entry of its own; the `.pcard[data-cat]`
  // rules fall back to the neutral slate rather than pretending to be Web.
  return `
    <div class="pcard${isRetest ? ' pcard-retest' : ''}" data-project="${p.id}" role="button" tabindex="0"
            data-cat="${h(p.category)}">
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


export function projectTableHTML(rows) {
  return `
    <div class="ptable-wrap">
      <table class="ptable">
        <thead>
          <tr>
            <th>Project</th>
            <th class="cell-cat">Category</th>
            <th class="hide-md cell-pm" title="Supervisor">SV</th>
            <th class="hide-md cell-team">Pentesters</th>
            <th class="cell-retests">Retests</th>
            <th class="cell-status">Status</th>
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
              <td class="cell-cat">${catBadge(row.project.category, row.project.platform)}</td>
              <td class="hide-md cell-pm">${supervisorCell(
                { id: row.project.supervisorId, name: row.project.supervisorName },
                'sm'
              )}</td>
              <td class="hide-md cell-team">${teamCell(row.project.pentesters, row.project.id)}</td>
              <td class="cell-retests">${
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
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}


/** True when any filter control deviates from its default. */
export function hasActiveFilters() {
  return Boolean(
    state.filters.q ||
      state.filters.status ||
      state.filters.category ||
      state.filters.clientId ||
      state.filters.applicationId
  );
}


export function emptyHTML() {
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


export function resultsHTML() {
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
      <span class="spacer ml-auto"></span>
      ${hasActiveFilters() ? `<button class="btn btn-sm btn-quiet" id="clear-filters">${icon.x(13)} Clear filters</button>` : ''}
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
export function mountContent() {
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


export function renderResults() {
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


export function bindQuickStatus(host) {
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


export function clearFilters() {
  state.filters = { q: '', status: '', category: '', env: '', method: '', clientId: '', applicationId: '' };
  const q = document.getElementById('filter-q');
  if (q) q.value = '';
  const clearBtn = document.getElementById('filter-clear');
  if (clearBtn) clearBtn.hidden = true;
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


export function bindFilters() {
  const q = document.getElementById('filter-q');
  const clear = document.getElementById('filter-clear');
  // The × appears only while there is something to clear: a permanent control
  // that does nothing on nine visits out of ten is noise.
  const syncClear = () => {
    if (clear) clear.hidden = !q.value;
  };
  syncClear();
  let timer;
  q.addEventListener('input', () => {
    syncClear();
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.filters.q = q.value.trim();
      loadProjects();
    }, 160);
  });
  // Escape empties the box from anywhere inside it — the same key that closes a
  // dialog should undo the thing you just typed.
  q.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !q.value) return;
    e.stopPropagation();
    q.value = '';
    syncClear();
    state.filters.q = '';
    loadProjects();
  });
  clear?.addEventListener('click', () => {
    q.value = '';
    syncClear();
    state.filters.q = '';
    q.focus();
    loadProjects();
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


export function syncFilterToggle() {
  const ft = document.getElementById('filter-toggle');
  if (!ft) return;
  // Assigned-to-me is a sidebar scope now, not a filter chip, so it is not
  // counted here: the active nav item already shows the scope.
  const n = ['clientId', 'applicationId', 'category', 'status'].filter((k) => state.filters[k]).length;
  ft.classList.toggle('btn-primary', n > 0);
}


export async function loadProjects() {
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


export async function refreshAll() {
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


export function openProjectForm(project = null) {
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
    <div class="field mt-14">
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

    <div class="field mt-14">
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
