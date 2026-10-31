import { deleteRetestFlow, loadProjects, openProjectForm, refreshAll } from './projects.js';
import { hideMenu, placeMenu } from './shared.js';
import { loadStats } from './shell.js';
import { ENUMS, canManageCatalog, state, statusTones } from './state.js';
import { bindPicker, pentesterPickerHTML, pickerValues } from './users.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { propLabel, propOptions, propTone } from './props.js';
import {
  avatar, bindSegmented, catBadge, catIcon,
  confirmDialog, contactLine, envBadge, fmtDate,
  fmtRelative, escapeHtml as h, methodBadge, openModal,
  quickStatus, segmented, segmentedValue, statusBadge,
  subroleBadge, toast, todayISO,
} from './ui.js';


/* ============================================================
   project drawer
   ============================================================ */
export function closeDrawer() {
  document.querySelectorAll('.drawer, .drawer-backdrop').forEach((el) => el.remove());
  state.drawerProjectId = null;
  state.drawer = null;
  document.removeEventListener('keydown', drawerKeyHandler);
}


export function drawerKeyHandler(e) {
  if (e.key === 'Escape' && document.querySelector('.modal-backdrop') === null) closeDrawer();
}


export async function openProject(id, tab = 'overview') {
  state.drawerProjectId = id;
  state.drawerTab = tab;
  await renderDrawer(id, tab, false);
}


export async function renderDrawer(id, tab = 'overview', keepOpen = true) {
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


export function drawerHTML(project, retests, tab) {
  const openRetests = retests.filter((r) => r.status === 'Incoming' || r.status === 'Ongoing').length;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'retests', label: 'Retests', count: retests.length },
    { id: 'notes', label: 'Notes' },
  ];

  return `
    <div class="drawer-head">
      <div class="row">
        <div class="cat-icon" data-cat="${h(project.category)}">
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
             <span class="note-count">${retests.length} client request${retests.length === 1 ? '' : 's'}</span>
             <div class="spacer"></div>
             <button class="btn btn-primary" data-add-retest>${icon.plus()} New retest</button>
           </div>`
        : `<div class="drawer-foot">
             <span class="note-updated">Updated ${fmtRelative(project.updatedAt)}</span>
             <div class="spacer"></div>
             <button class="btn" data-edit>${icon.edit()} Edit</button>
           </div>`
    }`;
}


export function tabBody(project, retests, tab) {
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

      <div class="mt-20">
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
                        ${g.people.map((p) => `<span class="pick on pick-readonly">${avatar(p.name)}<span>${h(p.name)}</span></span>`).join('')}
                      </div>
                    </div>`
                  )
                  .join('')}
              </div>`
            : `<p class="note-line">No pentester assigned yet.</p>`
        }
      </div>

      <div class="mt-20">
        <div class="section-head"><h3>Retest summary</h3><span class="spacer"></span>
          <button class="btn btn-sm" data-tab-jump="retests">View all ${icon.chevronRight()}</button>
        </div>
        <div class="info-grid">
          <div class="info-item"><div class="k">Total requests</div><div class="v">${retests.length}</div></div>
          <div class="info-item"><div class="k">Open</div><div class="v">${open}</div></div>
        </div>
        ${
          retests.length
            ? `<div class="retest-list mt-12">${retests.slice(0, 2).map(retestHTML).join('')}</div>`
            : ''
        }
      </div>
    </div>`;
  }

  if (tab === 'retests') {
    if (!retests.length) {
      return `<div class="empty empty-bare">
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
       <div class="mt-14">
         <button class="btn btn-sm" data-edit-notes>${icon.edit()} Edit notes</button>
       </div>`
    : `<div class="empty empty-bare">
        <div class="icon">${icon.note()}</div>
        <h3>No notes</h3>
        <p>Add scope details, credentials location, or out-of-scope items.</p>
        <button class="btn" data-edit-notes>${icon.edit()} Add notes</button>
      </div>`;
}


export function retestHTML(r) {
  const tone = propTone('status', r.status);
  return `
    <div class="retest" data-tone="${tone}" data-retest="${r.id}">
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
        <button class="btn btn-icon" data-retest-edit="${r.id}" aria-label="Edit retest">${icon.edit()}</button>
        ${canManageCatalog() ? `<button class="btn btn-icon btn-icon-danger" data-retest-del="${r.id}" aria-label="Delete retest">${icon.trash()}</button>` : ''}
      </div>
      ${r.notes ? `<div class="retest-note">${h(r.notes)}</div>` : ''}
    </div>`;
}


export function bindDrawer(el, project, retests) {
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
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = retests.find((x) => x.id === Number(btn.dataset.retestDel));
      deleteRetestFlow(r, { onDone: () => renderDrawer(project.id, 'retests', true) });
    })
  );
}


/* ============================================================
   retest form modal
   ============================================================ */
export function openRetestForm(projectId, retest = null, onDone) {
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
   focused sub-forms
   ------------------------------------------------------------
   The quick "+" in the Pentesters column and the "Edit notes" button used to
   dump the whole project form on the user for a one-field change. These two
   modals show exactly the field being changed and PATCH only that field.
   ============================================================ */

export function openTeamForm(project) {
  const body = `
    <div class="field mt-0">
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


export function openNotesForm(project) {
  const body = `
    <div class="field mt-0">
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
