import { api } from './api.js';
import { checklistBodyHTML, bindChecklistBody, CHECKLIST_STATUS } from './checklists.js';
import { icon } from './icons.js';
import { handleNav, setTitle } from './shell.js';
import { state } from './state.js';
import { escapeHtml as h, toast } from './ui.js';


/* ============================================================
   One project's checklist, on a page of its own
   ------------------------------------------------------------
   A real list is long — OWASP Top 10:2025 is twenty items, each with a note and
   an evidence field. In the drawer that is a column of scrolling; here it is a
   page you can filter, search and come back to, and the URL is shareable:
   `/project/12/checklist`.

   The item rendering is deliberately the SAME code the drawer used to show
   (`checklistBodyHTML` / `bindChecklistBody`), because two renderers for one
   checklist is how a status button ends up meaning two different things.
   ============================================================ */

function filtersHTML(links) {
  const totals = { all: 0, Open: 0, Pass: 0, Fail: 0, 'N/A': 0 };
  for (const link of links) {
    for (const item of link.items) {
      totals.all += 1;
      totals[item.status || 'Open'] += 1;
    }
  }
  const chips = [['all', 'All'], ...CHECKLIST_STATUS.map((s) => [s, s])];
  return chips
    .map(
      ([id, label]) => `<button type="button" class="ckp-chip" data-ckp-filter="${id}"
        aria-pressed="${id === 'all' ? 'true' : 'false'}">${h(label)}
        <span class="ckp-chip-count">${totals[id] || 0}</span></button>`
    )
    .join('');
}

function summaryHTML(links) {
  if (!links.length) return '';
  const total = links.reduce((n, l) => n + (Number(l.progress?.total) || 0), 0);
  const answered = links.reduce((n, l) => n + (Number(l.progress?.answered) || 0), 0);
  const fail = links.reduce((n, l) => n + (Number(l.progress?.fail) || 0), 0);
  return `<span class="ckp-sum">${answered} of ${total} answered</span>${
    fail
      ? `<span class="badge badge-outline" data-tone="rose"><span class="dot"></span>${fail} fail${fail === 1 ? '' : 's'}</span>`
      : ''
  }`;
}


export function checklistPageHTML() {
  return `<div class="ckp" id="ckp">
    <div class="ckp-head">
      <button type="button" class="btn btn-sm btn-ghost" data-ckp-back>
        ${icon.arrowLeft(14)} Projects
      </button>
      <div class="ckp-title">
        <h2 id="ckp-name">Checklist</h2>
        <p class="ckp-meta" id="ckp-meta"></p>
      </div>
      <div class="spacer"></div>
      <div class="ckp-tools">
        <span id="ckp-sum"></span>
        <label class="ckp-search">
          <span class="sr-only">Search this checklist</span>
          <input class="input" id="ckp-q" type="search" placeholder="Search items" autocomplete="off" />
        </label>
      </div>
    </div>
    <div class="ckp-filters" id="ckp-filters"></div>
    <div class="ckp-body" id="ckp-body">
      <div class="empty"><div class="icon">${icon.shield(24)}</div><h3>Loading…</h3></div>
    </div>
  </div>`;
}


/** Hides everything that does not match, and says so when nothing does. */
function applyFilter(root, status, query) {
  const q = String(query || '').trim().toLowerCase();
  const cards = root.querySelectorAll('.ck');

  cards.forEach((card) => {
    let shown = 0;
    let hideSection = false;
    let sectionNode = null;

    const decide = (node) => {
      if (node.classList.contains('ck-section')) {
        // The header is shown only if a visible item follows it.
        if (sectionNode) sectionNode.hidden = hideSection;
        sectionNode = node;
        hideSection = true;
        return;
      }
      const okStatus = status === 'all' || node.dataset.status === status;
      const okText = !q || node.textContent.toLowerCase().includes(q);
      node.hidden = !(okStatus && okText);
      if (!node.hidden) {
        shown += 1;
        hideSection = false;
      }
    };

    card.querySelectorAll('.ck-section, .ck-item').forEach(decide);
    if (sectionNode) sectionNode.hidden = hideSection;

    card.hidden = shown === 0;
  });

  const anyCard = [...cards].some((c) => !c.hidden);
  let notice = root.querySelector('.ckp-none');
  if (!anyCard) {
    if (!notice) {
      notice = document.createElement('p');
      notice.className = 'ckp-none faint';
      notice.textContent = 'Nothing matches that filter.';
      root.querySelector('#ckp-body').appendChild(notice);
    }
  } else if (notice) {
    notice.remove();
  }
}


function bindFilterChips(root, current) {
  const chips = [...root.querySelectorAll('[data-ckp-filter]')];
  const search = root.querySelector('#ckp-q');
  chips.forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.ckpFilter === current));
    chip.addEventListener('click', () => {
      bindFilterChips(root, chip.dataset.ckpFilter);
      applyFilter(root, chip.dataset.ckpFilter, search.value);
    });
  });
  return () => applyFilter(root, current, root.querySelector('#ckp-q').value);
}

function bindFilters(root) {
  const search = root.querySelector('#ckp-q');
  const paint = () => {
    const on = root.querySelector('[data-ckp-filter][aria-pressed="true"]');
    applyFilter(root, on ? on.dataset.ckpFilter : 'all', search.value);
  };
  bindFilterChips(root, 'all');
  search.addEventListener('input', paint);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      search.value = '';
      paint();
      e.stopPropagation();
    }
  });
}


export async function mountChecklistPage() {
  const root = document.getElementById('ckp');
  if (!root) return;

  const projectId = Number(state.checklistProjectId);
  if (!projectId) {
    handleNav('active');
    return;
  }

  const [projectRes, linksRes, filesRes] = await Promise.all([
    api.project(projectId).catch(() => ({ project: null })),
    api.projectChecklists(projectId).catch(() => ({ checklists: [] })),
    api.projectFiles(projectId).catch(() => ({ files: [] })),
  ]);
  const project = projectRes.project;
  const links = linksRes.checklists || [];
  const files = filesRes.files || [];

  if (!project) {
    toast('That project is gone — pick another one', 'err');
    handleNav('active');
    return;
  }

  const nameNode = root.querySelector('#ckp-name');
  nameNode.textContent = project.name;
  const meta = [project.client, project.category, project.status].filter(Boolean).join(' · ');
  root.querySelector('#ckp-meta').textContent = meta;
  root.querySelector('#ckp-sum').innerHTML = summaryHTML(links);
  setTitle('Checklist', `${project.name}${project.client ? ` · ${project.client}` : ''}`);
  document.title = `${project.name} · checklist`;

  root.querySelector('#ckp-filters').innerHTML = links.length ? filtersHTML(links) : '';
  const body = root.querySelector('#ckp-body');
  body.innerHTML = checklistBodyHTML(links, files);

  // Answering an item moves four numbers in the header (chips, answered total,
  // fail badge, per-list progress). Repainting them here keeps one source of
  // truth instead of a second guess at what the header should say.
  const paintHeader = () => {
    const on = root.querySelector('[data-ckp-filter][aria-pressed="true"]');
    const current = on ? on.dataset.ckpFilter : 'all';
    root.querySelector('#ckp-sum').innerHTML = summaryHTML(links);
    root.querySelector('#ckp-filters').innerHTML = filtersHTML(links);
    bindFilterChips(root, current);
    applyFilter(root, current, root.querySelector('#ckp-q').value);
  };

  bindChecklistBody(body, project, links, files, mountChecklistPage, paintHeader);
  bindFilters(root);

  root.querySelector('[data-ckp-back]')?.addEventListener('click', () => handleNav('active'));
}
