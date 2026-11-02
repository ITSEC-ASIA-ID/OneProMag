import { api } from './api.js';
import { icon } from './icons.js';
import { canManageCatalog } from './state.js';
import { closeDrawer } from './drawer.js';
import { openChecklistPage } from './shell.js';
import { confirmDialog, escapeHtml as h, fmtRelative, openModal, toast } from './ui.js';


/* ============================================================
   Security checklists
   ------------------------------------------------------------
   Two halves, one vocabulary:

     · the drawer's Checklist tab — a project links a template and works
       through it, one item at a time;
     · Admin panel → Checklists — the templates themselves.

   A project LINKS a template, it does not copy it. Fixing a typo in the Admin
   panel therefore fixes it for every engagement at once, which is the whole
   point of a shared checklist; the price is that editing mid-engagement
   changes what an old project shows. This records how an engagement was
   tested, it does not certify it, so the trade is the right way round.

   An unanswered item has NO row in `project_checklist_items`. `Open` is the
   absence of an answer, not a stored answer, so attaching a 120-item template
   writes nothing and then counts everything as open.
   ============================================================ */
export const CHECKLIST_STATUS = ['Open', 'Pass', 'Fail', 'N/A'];

/** `projects.category` values; '' is "fits any of them". */
const CHECKLIST_CATEGORIES = ['Web', 'Mobile', 'API', 'EDC'];

function categoryOptions(current = '') {
  return ['', ...CHECKLIST_CATEGORIES]
    .map(
      (c) =>
        `<option value="${c}"${c === (current || '') ? ' selected' : ''}>${c || 'Any category'}</option>`
    )
    .join('');
}

const OPEN = 'Open';


/** `3 of 10 answered · 1 fail` — progress a person can act on. */
function progressLine(progress) {
  const total = Number(progress?.total) || 0;
  const answered = Number(progress?.answered) || 0;
  const fail = Number(progress?.fail) || 0;
  if (!total) return 'No items yet';
  const parts = [`${answered} of ${total} answered`];
  if (fail) parts.push(`${fail} fail${fail === 1 ? '' : 's'}`);
  return parts.join(' · ');
}


function itemStamp(item) {
  if (!item.updatedAt) return 'Not answered yet';
  const who = item.updatedByName ? `${h(item.updatedByName)} · ` : '';
  return `${who}${h(fmtRelative(item.updatedAt))}`;
}


function itemHTML(item, files) {
  const status = CHECKLIST_STATUS.includes(item.status) ? item.status : OPEN;
  const note = item.note || '';
  const showNote = status === 'Fail' || Boolean(note.trim()) || Boolean(item.fileId);
  return `<div class="ck-item" data-ck-item="${item.id}" data-status="${h(status)}">
    <div class="ck-line">
      <div class="ck-seg" role="group" aria-label="Result for ${h(item.title)}">
        ${CHECKLIST_STATUS.map(
          (s) =>
            `<button type="button" class="ck-seg-btn" data-ck-set="${h(s)}" data-status="${h(s)}"
               aria-pressed="${s === status}">${h(s)}</button>`
        ).join('')}
      </div>
      <span class="ck-item-title">${h(item.title)}</span>
      <div class="spacer"></div>
      ${
        item.help
          ? `<button type="button" class="btn btn-icon btn-icon-sm" data-ck-help
               aria-expanded="false" title="What this is about" aria-label="What ${h(item.title)} is about">${icon.alert(13)}</button>`
          : ''
      }
      <button type="button" class="btn btn-icon btn-icon-sm" data-ck-note-btn
        aria-expanded="${showNote}" title="Note" aria-label="Note on ${h(item.title)}">${icon.note(13)}</button>
    </div>
    ${item.help ? `<p class="ck-help" hidden>${h(item.help)}</p>` : ''}
    <div class="ck-note-wrap" ${showNote ? '' : 'hidden'}>
      <textarea class="input ck-note" data-ck-note rows="2"
        placeholder="What you found, or why it does not apply…">${h(note)}</textarea>
      ${
        files.length
          ? `<select class="input ck-file" data-ck-file aria-label="Evidence file for ${h(item.title)}">
               <option value="">No evidence file</option>
               ${files
                 .map(
                   (f) =>
                     `<option value="${f.id}" ${Number(item.fileId) === Number(f.id) ? 'selected' : ''}>${h(f.name)}</option>`
                 )
                 .join('')}
             </select>`
          : ''
      }
      <div class="ck-stamp">${itemStamp(item)}</div>
    </div>
  </div>`;
}


function checklistCardHTML(link, files) {
  let section = null;
  const rows = [];
  for (const item of link.items) {
    const name = item.section || '';
    if (name !== section) {
      section = name;
      if (name) rows.push(`<div class="ck-section"><span>${h(name)}</span></div>`);
    }
    rows.push(itemHTML(item, files));
  }

  return `<section class="ck" data-ck="${link.id}">
    <div class="ck-head">
      <div class="ck-titlebox">
        <h4>${h(link.name)}</h4>
        <span class="ck-prog">${h(progressLine(link.progress))}</span>
      </div>
      <div class="spacer"></div>
      ${
        // Swapping throws the answers away, so it belongs to the people who can
        // remove things once anything has been answered.
        !Number(link.progress?.answered) || canManageCatalog()
          ? `<button type="button" class="btn btn-sm" data-ck-change>Change</button>`
          : ''
      }
      ${
        canManageCatalog()
          ? `<button type="button" class="btn btn-icon btn-icon-danger" data-ck-detach="${link.id}"
               title="Remove this checklist from the project" aria-label="Remove ${h(link.name)}">${icon.trash(13)}</button>`
          : ''
      }
    </div>
    ${link.description ? `<p class="ck-desc">${h(link.description)}</p>` : ''}
    <div class="ck-items">${rows.join('') || '<p class="ck-desc">This template has no items yet.</p>'}</div>
  </section>`;
}


/**
 * A project carries ONE checklist, so this renders a card or an invitation —
 * never a list of lists.
 */
export function checklistBodyHTML(links = [], files = []) {
  const link = links[0] || null;
  return `<div class="ck-wrap">
    ${
      link
        ? checklistCardHTML(link, files)
        : `<div class="empty">
             <div class="icon">${icon.shield(24)}</div>
             <h3>No checklist on this project</h3>
             <p>Choose one to work through — a project keeps a single checklist, and it can be swapped later (which discards its answers).</p>
             <button type="button" class="btn btn-primary" data-ck-attach>${icon.plus(14)} Choose a checklist</button>
           </div>`
    }
  </div>`;
}


/**
 * Keeps the tab's fail count honest while the tab is open.
 *
 * The badge is painted from `extras` when the drawer opens; without this an
 * answer would leave it claiming "0 fails" until the user closed and reopened
 * the project, which is exactly the number they are watching.
 */
function syncTabBadge(links) {
  const btn = document.querySelector('.drawer [data-tab="checklist"]');
  if (!btn) return;
  const fails = links.reduce((n, l) => n + (Number(l.progress?.fail) || 0), 0);
  let badge = btn.querySelector('.n');
  if (!fails) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'n';
    btn.appendChild(badge);
  }
  badge.textContent = String(fails);
}


/** Repaints one item in place, so answering does not lose the reader's scroll. */
function applyAnswer(itemEl, item) {
  itemEl.dataset.status = item.status;
  itemEl.querySelectorAll('[data-ck-set]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.ckSet === item.status ? 'true' : 'false');
  });
  const wrap = itemEl.querySelector('.ck-note-wrap');
  const hasNote = Boolean((item.note || '').trim()) || Boolean(item.fileId);
  if (wrap && (item.status === 'Fail' || hasNote)) wrap.hidden = false;
  itemEl.querySelector('[data-ck-note-btn]')?.setAttribute('aria-expanded', String(!wrap?.hidden));
  const stamp = itemEl.querySelector('.ck-stamp');
  if (stamp) stamp.innerHTML = itemStamp(item);
}


export function bindChecklistBody(el, project, links, files, reload, onProgress = null) {
  el.querySelector('[data-ck-attach]')?.addEventListener('click', () =>
    openAttachPicker(project, links, reload)
  );
  el.querySelector('[data-ck-change]')?.addEventListener('click', () =>
    openAttachPicker(project, links, reload)
  );

  el.querySelectorAll('[data-ck-help]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const help = btn.closest('.ck-item')?.querySelector('.ck-help');
      if (!help) return;
      help.hidden = !help.hidden;
      btn.setAttribute('aria-expanded', String(!help.hidden));
    })
  );

  el.querySelectorAll('[data-ck-note-btn]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const wrap = btn.closest('.ck-item')?.querySelector('.ck-note-wrap');
      if (!wrap) return;
      wrap.hidden = !wrap.hidden;
      btn.setAttribute('aria-expanded', String(!wrap.hidden));
      if (!wrap.hidden) wrap.querySelector('[data-ck-note]')?.focus({ preventScroll: true });
    })
  );

  el.querySelectorAll('[data-ck-detach]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const link = links.find((l) => l.id === Number(btn.dataset.ckDetach));
      if (!link) return;
      const answered = Number(link.progress?.answered) || 0;
      const ok = await confirmDialog({
        title: 'Remove checklist?',
        message: answered
          ? `"${link.name}" will be removed from this project, along with ${answered} answer${
              answered === 1 ? ' and its note' : 's and their notes'
            }. The template itself stays in the Admin panel.`
          : `"${link.name}" will be removed from this project. Nothing has been answered yet.`,
        confirmLabel: 'Remove checklist',
      });
      if (!ok) return;
      try {
        await api.detachChecklist(link.id);
        toast('Checklist removed');
        await reload();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });

  el.querySelectorAll('.ck').forEach((card) => {
    const link = links.find((l) => l.id === Number(card.dataset.ck));
    if (!link) return;
    const prog = card.querySelector('.ck-prog');

    card.querySelectorAll('[data-ck-set]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const itemEl = btn.closest('.ck-item');
        try {
          const res = await api.answerChecklistItem(link.id, Number(itemEl.dataset.ckItem), {
            status: btn.dataset.ckSet,
          });
          const item = link.items.find((i) => i.id === Number(itemEl.dataset.ckItem));
          if (item) Object.assign(item, { status: res.item.status, updatedAt: res.item.updatedAt, updatedByName: res.item.updatedByName });
          link.progress = res.progress;
          applyAnswer(itemEl, res.item);
          if (prog) prog.textContent = progressLine(res.progress);
          syncTabBadge(links);
          // The page's own counters (chips, "N of M answered") are painted from
          // the same numbers, so it has to be told an answer landed.
          if (onProgress) onProgress();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });

    card.querySelectorAll('[data-ck-note]').forEach((area) => {
      const itemEl = area.closest('.ck-item');
      const item = link.items.find((i) => i.id === Number(itemEl.dataset.ckItem));
      const save = async () => {
        const value = area.value.trim();
        if (!item || value === (item.note || '').trim()) return;
        try {
          const res = await api.answerChecklistItem(link.id, item.id, { note: value });
          Object.assign(item, {
            note: res.item.note,
            updatedAt: res.item.updatedAt,
            updatedByName: res.item.updatedByName,
          });
          const stamp = itemEl.querySelector('.ck-stamp');
          if (stamp) stamp.innerHTML = itemStamp(res.item);
        } catch (err) {
          toast(err.message, 'err');
        }
      };
      area.addEventListener('blur', save);
      area.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          area.blur();
        }
      });
    });

    card.querySelectorAll('[data-ck-file]').forEach((select) => {
      const itemEl = select.closest('.ck-item');
      const item = link.items.find((i) => i.id === Number(itemEl.dataset.ckItem));
      select.addEventListener('change', async () => {
        if (!item) return;
        try {
          const res = await api.answerChecklistItem(link.id, item.id, {
            fileId: select.value ? Number(select.value) : null,
          });
          Object.assign(item, { fileId: res.item.fileId, updatedAt: res.item.updatedAt });
          const stamp = itemEl.querySelector('.ck-stamp');
          if (stamp) stamp.innerHTML = itemStamp(res.item);
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });
  });
}


/**
 * Chooses the project's checklist. A project holds exactly one, so picking a
 * different one REPLACES it — and the answers belonging to the old items are
 * destroyed with it, which the caller must be told before it happens.
 */
async function openAttachPicker(project, links, reload) {
  const current = links[0] || null;
  let available = [];
  try {
    const { checklists } = await api.checklists();
    available = checklists;
  } catch (err) {
    toast(err.message, 'err');
    return;
  }
  if (!available.length) {
    toast('No checklist template exists yet — create one in the Admin panel');
    return;
  }
  const answered = Number(current?.progress?.answered) || 0;

  openModal({
    title: current ? 'Change checklist' : 'Choose a checklist',
    subtitle: current
      ? answered
        ? `This project has ${answered} answer${answered === 1 ? '' : 's'} on "${current.name}". Choosing another checklist discards them.`
        : 'The project links the template, so edits in the Admin panel reach it too.'
      : 'The project links the template, so edits in the Admin panel reach it too.',
    body: `<div class="ck-pick">
      ${available
        .map(
          (c) => `<button type="button" class="ck-pick-item${current?.checklistId === c.id ? ' on' : ''}" data-pick="${c.id}">
            <span class="ck-pick-check">${icon.check(13)}</span>
            <span class="ck-pick-text">
              <span class="ck-pick-name">${h(c.name)}${
                current?.checklistId === c.id ? ' <span class="ck-pick-now">on this project</span>' : ''
              }</span>
              <span class="ck-pick-meta">${Number(c.itemCount) || 0} item${Number(c.itemCount) === 1 ? '' : 's'}${
                c.category ? ` · ${h(c.category)}` : ''
              }${c.isDefault ? ' · default' : ''}${c.description ? ` · ${h(c.description)}` : ''}</span>
            </span>
          </button>`
        )
        .join('')}
    </div>`,
    footer: `<span class="spacer"></span>
      <button class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary" data-attach-go ${current ? '' : 'disabled'}>${current ? 'Use this checklist' : 'Attach'}</button>`,
    onMount: (modal, close) => {
      let chosen = current ? Number(current.checklistId) : null;
      const go = modal.querySelector('[data-attach-go]');
      modal.querySelectorAll('[data-pick]').forEach((btn) =>
        btn.addEventListener('click', () => {
          chosen = Number(btn.dataset.pick);
          modal.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('on', b === btn));
          go.disabled = false;
        })
      );
      go.addEventListener('click', async () => {
        if (!chosen || chosen === current?.checklistId) {
          close();
          return;
        }
        go.disabled = true;
        try {
          const res = await api.attachChecklist(project.id, chosen);
          toast(res.replaced ? 'Checklist replaced' : 'Checklist attached');
          close();
          await reload();
        } catch (err) {
          toast(err.message, 'err');
          go.disabled = false;
        }
      });
    },
  });
}


/* ============================================================
   Admin panel → Checklists
   ============================================================ */
function templateRowHTML(c) {
  const items = Number(c.itemCount) || 0;
  const used = Number(c.projectCount) || 0;
  return `<tr data-ck-row="${c.id}">
    <td class="dev-name">${h(c.name)}${
      c.category || c.isDefault
        ? `<span class="ck-marks">${c.category ? `<span class="badge badge-outline" data-tone="slate">${h(c.category)}</span>` : ''}${
            c.isDefault ? `<span class="badge badge-outline" data-tone="amber"><span class="dot"></span>default</span>` : ''
          }</span>`
        : ''
    }${c.description ? `<span class="ck-sub">${h(c.description)}</span>` : ''}</td>
    <td class="dev-mono-cell">${items} item${items === 1 ? '' : 's'}</td>
    <td>${used ? `<span class="badge badge-outline" data-tone="amber"><span class="dot"></span>${used} project${used === 1 ? '' : 's'}</span>` : '<span class="faint">not in use</span>'}</td>
    <td class="dev-acts"><span class="dev-acts-inner">
      <button type="button" class="btn btn-icon" data-ck-edit="${c.id}" title="Edit" aria-label="Edit ${h(c.name)}">${icon.edit(13)}</button>
      <button type="button" class="btn btn-icon btn-icon-danger" data-ck-del="${c.id}"
        title="${used ? 'Attached to a project — detach it first' : 'Delete'}"
        aria-label="Delete ${h(c.name)}" ${used ? 'disabled' : ''}>${icon.trash(13)}</button>
    </span></td>
  </tr>`;
}


function sectionsHTML(checklists) {
  return `<section class="admin-sec">
    <div class="admin-sec-head">
      <h3>Templates</h3>
      <span class="admin-count">${checklists.length}</span>
      <p>Edits reach every project that links them.</p>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-ck-new>${icon.plus(13)} Checklist</button>
    </div>
    ${
      checklists.length
        ? `<div class="dev-tablewrap">
             <table class="dev-table">
               <thead><tr>
                 <th class="dev-h-label"><span class="dev-h-inner"><span class="dev-h-label">Checklist</span></span></th>
                 <th class="dev-h-key"><span class="dev-h-inner"><span class="dev-h-label">Items</span></span></th>
                 <th class="dev-h-badge"><span class="dev-h-inner"><span class="dev-h-label">In use</span></span></th>
                 <th class="dev-h-acts"><span class="sr-only">Actions</span></th>
               </tr></thead>
               <tbody>${checklists.map(templateRowHTML).join('')}</tbody>
             </table>
           </div>`
        : `<div class="empty">
             <div class="icon">${icon.shield(24)}</div>
             <h3>No checklist templates yet</h3>
             <p>Write one item per line of the threat you are checking for, and every engagement can be measured against it.</p>
           </div>`
    }
  </section>`;
}


export function checklistsPageHTML() {
  return `<div class="admin">
    <div class="admin-head">
      <p>
        The security checklists an engagement can be measured against. A project links a
        template rather than copying it, so a fix here reaches every project at once —
        the answers stay with the project.
      </p>
    </div>
    <div id="ck-admin-body"><div class="empty"><h3>Loading…</h3></div></div>
  </div>`;
}


export async function refreshChecklists() {
  const host = document.getElementById('ck-admin-body');
  if (!host) return;
  let checklists = [];
  try {
    ({ checklists } = await api.checklists());
  } catch (err) {
    host.innerHTML = `<div class="empty"><h3>Could not load checklists</h3><p>${h(err.message)}</p></div>`;
    return;
  }

  host.innerHTML = sectionsHTML(checklists);
  host.querySelector('[data-ck-new]')?.addEventListener('click', () => openChecklistForm(null));
  host.querySelectorAll('[data-ck-edit]').forEach((b) =>
    b.addEventListener('click', () => openChecklistForm(Number(b.dataset.ckEdit)))
  );
  host.querySelectorAll('[data-ck-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = checklists.find((c) => c.id === Number(b.dataset.ckDel));
      if (!row) return;
      const ok = await confirmDialog({
        title: 'Delete checklist?',
        message: `"${row.name}" and its ${Number(row.itemCount) || 0} item${
          Number(row.itemCount) === 1 ? '' : 's'
        } will be deleted. Projects that link it are refused, so nothing breaks silently.`,
        confirmLabel: 'Delete checklist',
      });
      if (!ok) return;
      try {
        await api.deleteChecklist(row.id);
        toast('Checklist deleted');
        await refreshChecklists();
      } catch (err) {
        toast(err.message, 'err');
      }
    })
  );
}


function itemEditRowHTML(item) {
  const id = item?.id ? String(item.id) : '';
  const section = item?.section || '';
  const title = item?.title || '';
  const help = item?.help || '';
  return `<div class="ck-edit-row" data-item-id="${id}" data-orig-section="${h(section)}"
      data-orig-title="${h(title)}" data-orig-help="${h(help)}">
    <input class="input ck-edit-section" value="${h(section)}" placeholder="Section" aria-label="Section" />
    <input class="input ck-edit-title" value="${h(title)}" placeholder="What to check" aria-label="Item" />
    <input class="input ck-edit-help" value="${h(help)}" placeholder="How to check it (optional)" aria-label="Help" />
    <span class="ck-edit-acts">
      <button type="button" class="btn btn-icon" data-item-up title="Move up" aria-label="Move up">${icon.arrowUp(13)}</button>
      <button type="button" class="btn btn-icon" data-item-down title="Move down" aria-label="Move down">${icon.arrowDown(13)}</button>
      <button type="button" class="btn btn-icon btn-icon-danger" data-item-del title="Remove item" aria-label="Remove item">${icon.trash(13)}</button>
    </span>
  </div>`;
}


export async function openChecklistForm(id) {
  let checklist = { id: null, name: '', description: '', category: '', isDefault: false, items: [] };
  if (id) {
    try {
      const res = await api.checklist(id);
      checklist = res.checklist;
    } catch (err) {
      toast(err.message, 'err');
      return;
    }
  }
  const editing = Boolean(checklist.id);

  openModal({
    title: editing ? `Edit ${checklist.name}` : 'New checklist',
    subtitle: editing
      ? 'Renaming or reordering an item changes what every linked project shows.'
      : 'An empty template is fine — items can be pasted in now or later.',
    wide: true,
    body: `<div class="field">
        <label class="label" for="ck-name">Name</label>
        <input class="input" id="ck-name" value="${h(checklist.name)}" placeholder="e.g. OWASP Top 10 2021" />
      </div>
      <div class="field">
        <label class="label" for="ck-desc">Description</label>
        <input class="input" id="ck-desc" value="${h(checklist.description || '')}"
          placeholder="One line on what this list is for" />
      </div>
      <div class="field-row">
        <div class="field">
          <label class="label" for="ck-cat">Category</label>
          <select class="input" id="ck-cat">${categoryOptions(checklist.category)}</select>
          <span class="form-hint">Which kind of project this list answers to.</span>
        </div>
        <div class="field">
          <label class="label" for="ck-default">Default</label>
          <label class="switch-row" for="ck-default">
            <input type="checkbox" id="ck-default"${checklist.isDefault ? ' checked' : ''} />
            <span>Attach it to a new project of this category on its own</span>
          </label>
        </div>
      </div>
      <div class="field">
        <label class="label">Items <span class="ck-edit-count"></span></label>
        <div class="ck-edit-list" id="ck-items">
          ${checklist.items.map(itemEditRowHTML).join('')}
        </div>
        <div class="ck-edit-tools">
          <button type="button" class="btn btn-sm" data-item-add>${icon.plus(13)} Item</button>
          <button type="button" class="btn btn-sm btn-ghost" data-paste-open>Paste a list</button>
        </div>
        <div class="ck-paste" hidden>
          <textarea class="input mono" id="ck-paste" rows="4"
            placeholder="Section | What to check | How to check it"></textarea>
          <div class="ck-paste-foot">
            <span class="form-hint">One item per line: <code>Section | What to check | How to check it</code>. Two columns read as item | help.</span>
            <span class="spacer"></span>
            <button type="button" class="btn btn-sm" data-paste-apply>Add these</button>
          </div>
        </div>
      </div>`,
    footer: `<span class="spacer"></span>
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save checklist' : 'Create checklist'}</button>`,
    onMount: (modal, close) => {
      const list = modal.querySelector('#ck-items');
      const count = modal.querySelector('.ck-edit-count');
      const removed = new Set();

      const repaintCount = () => {
        const n = list.querySelectorAll('.ck-edit-row').length;
        count.textContent = `· ${n}`;
      };
      repaintCount();

      const wireRow = (row) => {
        row.querySelector('[data-item-del]')?.addEventListener('click', () => {
          if (row.dataset.itemId) removed.add(Number(row.dataset.itemId));
          row.remove();
          repaintCount();
        });
        row.querySelector('[data-item-up]')?.addEventListener('click', () => {
          const prev = row.previousElementSibling;
          if (prev) list.insertBefore(row, prev);
        });
        row.querySelector('[data-item-down]')?.addEventListener('click', () => {
          const next = row.nextElementSibling;
          if (next) list.insertBefore(next, row);
        });
      };
      list.querySelectorAll('.ck-edit-row').forEach(wireRow);

      const appendRow = (item) => {
        list.insertAdjacentHTML('beforeend', itemEditRowHTML(item));
        wireRow(list.lastElementChild);
        repaintCount();
      };

      modal.querySelector('[data-item-add]')?.addEventListener('click', () => appendRow(null));
      modal.querySelector('[data-paste-open]')?.addEventListener('click', () => {
        const box = modal.querySelector('.ck-paste');
        box.hidden = !box.hidden;
        if (!box.hidden) box.querySelector('#ck-paste').focus();
      });
      modal.querySelector('[data-paste-apply]')?.addEventListener('click', () => {
        const text = modal.querySelector('#ck-paste').value;
        const parsed = parsePasted(text);
        if (!parsed.length) {
          toast('Nothing to add — use "Section | What to check | How to check it" per line', 'err');
          return;
        }
        parsed.forEach(appendRow);
        modal.querySelector('#ck-paste').value = '';
        toast(`${parsed.length} item${parsed.length === 1 ? '' : 's'} added — remember to save`);
      });

      modal.querySelector('[data-save]')?.addEventListener('click', async () => {
        const name = modal.querySelector('#ck-name').value.trim();
        const description = modal.querySelector('#ck-desc').value.trim();
        if (!name) {
          toast('A checklist needs a name', 'err');
          modal.querySelector('#ck-name').focus();
          return;
        }
        if (!modal.querySelector('#ck-cat').value && modal.querySelector('#ck-default').checked) {
          toast('Pick a category before making this the default', 'err');
          modal.querySelector('#ck-cat').focus();
          return;
        }
        const save = modal.querySelector('[data-save]');
        save.disabled = true;
        try {
          let targetId = checklist.id;
          const meta = {
            name,
            description,
            category: modal.querySelector('#ck-cat').value,
            isDefault: modal.querySelector('#ck-default').checked,
          };
          if (editing) await api.updateChecklist(targetId, meta);
          else targetId = (await api.createChecklist(meta)).checklist.id;

          for (const itemId of removed) await api.deleteChecklistItem(itemId);

          const fresh = [];
          for (const row of list.querySelectorAll('.ck-edit-row')) {
            const next = {
              section: row.querySelector('.ck-edit-section').value.trim(),
              title: row.querySelector('.ck-edit-title').value.trim(),
              help: row.querySelector('.ck-edit-help').value.trim(),
            };
            const before = {
              section: row.dataset.origSection || '',
              title: row.dataset.origTitle || '',
              help: row.dataset.origHelp || '',
            };
            const id2 = row.dataset.itemId ? Number(row.dataset.itemId) : null;
            if (!next.title) continue;
            if (id2) {
              if (next.section !== before.section || next.title !== before.title || next.help !== before.help) {
                await api.updateChecklistItem(id2, next);
              }
            } else {
              fresh.push(next);
            }
          }
          if (fresh.length) await api.createChecklistItems(targetId, fresh);

          toast(editing ? 'Checklist saved' : 'Checklist created');
          close();
          await refreshChecklists();
        } catch (err) {
          toast(err.message, 'err');
          save.disabled = false;
        }
      });
    },
  });
}


/** `Section | What to check | How to check it`, one item per line. */
export function parsePasted(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 3) return { section: parts[0], title: parts[1], help: parts.slice(2).join(' | ') };
      if (parts.length === 2) return { section: '', title: parts[0], help: parts[1] };
      return { section: '', title: parts[0], help: '' };
    })
    .filter((item) => item.title);
}
