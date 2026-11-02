import { api } from './api.js';
import { bindProjectActions, tabBody } from './drawer.js';
import { handleNav, setTitle } from './shell.js';
import { openProjectForm } from './projects.js';
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

   It keeps the drawer's tabs, because "which of these things am I looking at" is
   the same question on a page as in a column — and because the tab you were on
   belongs in the address.

   Nothing here re-implements the drawer: `tabBody` renders the panels and
   `bindProjectActions` wires them, so a status button cannot mean one thing in
   the drawer and another here.
   ============================================================ */

const TABS = ['overview', 'notes', 'attachments', 'retests', 'checklist', 'pentest-notes'];

let pageCache = null;


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


function headHTML(project, retests, tab, extras) {
  const openRetests = retests.filter((r) => r.status === 'Incoming' || r.status === 'Ongoing').length;
  const fails = (extras.checklists || []).reduce((n, c) => n + (Number(c.progress?.fail) || 0), 0);
  // Same rule as the drawer: a count only where it says something. A "0" badge
  // is noise; an absent one means "nothing waiting here".
  const counts = {
    attachments: (extras.files || []).length || undefined,
    retests: retests.length || undefined,
    checklist: fails || undefined,
    'pentest-notes': (extras.pentestNotes || []).length || undefined,
  };
  const labels = {
    overview: 'Overview',
    notes: 'Notes',
    attachments: 'Files',
    retests: 'Retests',
    checklist: 'Checklist',
    'pentest-notes': 'Pentest notes',
  };

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
    <div class="tabs pjp-tabs">
      ${TABS
        .map(
          (id) => `<button class="tab ${id === tab ? 'active' : ''}" data-pjp-tab="${id}"
            aria-current="${id === tab ? 'page' : 'false'}">${labels[id]}${
              counts[id] !== undefined ? `<span class="n">${counts[id]}</span>` : ''
            }</button>`
        )
        .join('')}
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

  // Changing tabs must not refetch: the drawer already proved that a tab is a
  // view of data the header needs anyway (three counts live in it). One load
  // per project, then repaints are local.
  if (!pageCache || pageCache.id !== projectId) {
    const [projectRes, linksRes, fileRes, noteRes] = await Promise.all([
      api.project(projectId).catch(() => ({ project: null })),
      api.projectChecklists(projectId).catch(() => ({ checklists: [] })),
      api.projectFiles(projectId).catch(() => ({ files: [] })),
      api.pentestNotes(projectId).catch(() => ({ notes: [] })),
    ]);
    pageCache = {
      id: projectId,
      data: projectRes,
      links: linksRes.checklists || [],
      files: fileRes.files || [],
      notes: noteRes.notes || [],
    };
  }

  const project = pageCache.data.project;
  if (!project) {
    pageCache = null;
    toast('That project is gone — pick another one', 'err');
    handleNav('active');
    return;
  }

  const retests = pageCache.data.retests || [];
  const extras = { files: pageCache.files, checklists: pageCache.links, pentestNotes: pageCache.notes };
  const tab = TABS.includes(state.projectTab) ? state.projectTab : 'overview';

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
  body.innerHTML = `${headHTML(project, retests, tab, extras)}
    <section class="pjp-sec" id="pjp-panel">${panelHTML(project, retests, tab, extras)}</section>`;

  bindPanel(project, retests, tab, extras);

  acts.querySelector('[data-pjp-edit]').addEventListener('click', () => openProjectForm(project));
  acts.querySelector('[data-pjp-del]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete project?',
      message: `"${project.name}", its ${retests.length} retest request(s), its files and its checklist answers will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete project',
    });
    if (!ok) return;
    pageCache = null;
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


/** The panel for one tab. Retests keep their heading and its New button. */
function panelHTML(project, retests, tab, extras) {
  if (tab === 'overview') return tabBody(project, retests, 'overview', extras);
  if (tab === 'attachments') return tabBody(project, retests, 'attachments', extras);
  if (tab === 'checklist') return tabBody(project, retests, 'checklist', extras);
  if (tab === 'pentest-notes') return tabBody(project, retests, 'pentest-notes', extras);
  if (tab === 'retests') {
    // The empty state carries its own "New retest"; only a populated list needs
    // the heading's button, or the page offers the same action twice.
    return `<div class="section-head"><h3>Client requests</h3>
        <span class="badge badge-outline">${retests.length}</span>
        <span class="spacer"></span>
        ${
          retests.length
            ? `<button class="btn btn-sm" data-add-retest>${icon.plus()} New retest</button>`
            : ''
        }
      </div>
      ${tabBody(project, retests, 'retests', extras)}`;
  }
  return tabBody(project, retests, 'notes', extras);
}


function bindPanel(project, retests, tab, extras) {
  // Bound on the body, not the panel: the status menu lives in the header, and
  // `bindProjectActions` is what makes it clickable — the same call the drawer
  // makes, which is the point.
  const body = document.getElementById('pjp-body');
  if (!body) return;

  // Repainting the page after a change: same project, same tab, fresh data.
  const reload = async () => {
    pageCache = null;
    await mountProjectPage();
  };

  bindProjectActions(body, project, retests, extras, reload);

  document.querySelectorAll('[data-pjp-tab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.projectTab = btn.dataset.pjpTab;
      handleNav('project', { history: 'push' });
    })
  );

}


/** Forgets the cached project, so the next mount refetches. */
export function forgetProjectPage() {
  pageCache = null;
}
