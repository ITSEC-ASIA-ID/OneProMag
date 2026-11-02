import { api } from './api.js';
import { bindProjectActions, tabBody } from './drawer.js';
import { openProjectForm } from './projects.js';
import { handleNav, setTitle } from './shell.js';
import { canManageCatalog, state } from './state.js';
import { icon } from './icons.js';
import {
  catBadge, catIcon, confirmDialog, envBadge, methodBadge, escapeHtml as h,
  quickStatus, toast,
} from './ui.js';


/* ============================================================
   One project, on a page of its own
   ------------------------------------------------------------
   The drawer is a glance: it is 520px wide and it sits on top of the list you
   were reading. A project with a bench of six, four retests and a page of notes
   does not fit in a glance, so `/project/12` is the same content with room to
   read it, a URL you can send someone, and the browser's own Back.

   Nothing here re-implements the drawer: `tabBody` renders the panels and
   `bindProjectActions` wires them, so a status button cannot mean one thing in
   the drawer and another here.
   ============================================================ */

export function projectPageHTML() {
  return `<div class="pjp" id="pjp">
    <div class="pjp-head">
      <button type="button" class="btn btn-sm btn-ghost" data-pjp-back>
        ${icon.arrowLeft(14)} Projects
      </button>
      <div class="spacer"></div>
      <div class="pjp-acts" id="pjp-acts"></div>
    </div>
    <div id="pjp-body">
      <div class="empty"><div class="icon">${icon.briefcase(24)}</div><h3>Loading…</h3></div>
    </div>
  </div>`;
}


function headHTML(project, retests) {
  const openRetests = retests.filter((r) => r.status === 'Incoming' || r.status === 'Ongoing').length;
  return `<header class="pjp-title">
    <div class="pjp-title-main">
      <div class="cat-icon" data-cat="${h(project.category || '')}">${catIcon(project.category, 20)}</div>
      <div>
        <h2>${h(project.name)}</h2>
        <div class="pjp-meta">
          ${quickStatus(project.status, project.id)}
          ${catBadge(project.category, project.platform)}
          ${envBadge(project.env)}
          ${methodBadge(project.method)}
          ${
            openRetests
              ? `<span class="badge pulse" data-tone="cyan"><span class="dot"></span>${openRetests} open retest${openRetests > 1 ? 's' : ''}</span>`
              : ''
          }
        </div>
        <div class="drawer-client">
          ${icon.building(14)}
          <span>${h(project.client || 'No client')}${
            project.applicationName ? ` &ndash; ${h(project.applicationName)}` : ''
          }${project.variantName ? ` &ndash; ${h(project.variantName)}` : ''}</span>
        </div>
      </div>
    </div>
  </header>`;
}


export async function mountProjectPage() {
  const root = document.getElementById('pjp');
  if (!root) return;

  const projectId = Number(state.projectViewId);
  if (!projectId) {
    handleNav('active');
    return;
  }

  const [projectRes, linksRes, fileRes] = await Promise.all([
    api.project(projectId).catch(() => ({ project: null })),
    api.projectChecklists(projectId).catch(() => ({ checklists: [] })),
    api.projectFiles(projectId).catch(() => ({ files: [] })),
  ]);
  const project = projectRes.project;
  if (!project) {
    toast('That project is gone — pick another one', 'err');
    handleNav('active');
    return;
  }

  const retests = projectRes.retests || [];
  const extras = {
    files: fileRes.files || [],
    checklists: linksRes.checklists || [],
  };

  setTitle(project.name, `${project.client || 'No client'} · ${project.category || ''}`);
  document.title = project.name;

  const acts = root.querySelector('#pjp-acts');
  acts.innerHTML = `
    <button type="button" class="btn btn-sm" data-pjp-edit>
      ${icon.edit(14)} Edit project
    </button>
    ${
      // The server refuses with 403 anyway; not offering the button means a
      // Member never sees a control that only exists to say no.
      canManageCatalog()
        ? `<button type="button" class="btn btn-sm btn-icon-danger" data-pjp-del aria-label="Delete project" title="Delete project">${icon.trash(14)}</button>`
        : ''
    }`;

  const body = root.querySelector('#pjp-body');
  body.innerHTML = `${headHTML(project, retests)}
    <section class="pjp-sec">${tabBody(project, retests, 'overview', extras)}</section>
    <section class="pjp-sec" id="sec-retests">
      <div class="section-head"><h3>Retests</h3><span class="badge badge-outline">${retests.length}</span>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-add-retest>${icon.plus()} New retest</button>
      </div>
      ${tabBody(project, retests, 'retests', extras)}
    </section>
    <section class="pjp-sec" id="sec-notes">
      <div class="section-head"><h3>Notes</h3></div>
      ${tabBody(project, retests, 'notes', extras)}
    </section>`;

  bindProjectActions(body, project, retests, extras, mountProjectPage);

  acts.querySelector('[data-pjp-edit]').addEventListener('click', () => openProjectForm(project));
  acts.querySelector('[data-pjp-del]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete project?',
      message: `"${project.name}", its ${retests.length} retest request(s), its files and its checklist answers will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete project',
    });
    if (!ok) return;
    try {
      await api.deleteProject(project.id);
      toast('Project deleted');
      handleNav('active');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  root.querySelector('[data-pjp-back]').addEventListener('click', () => handleNav('active'));
}
