import { api } from './api.js';
import { icon } from './icons.js';
import { canManageCatalog, state } from './state.js';
import { propLabel, propOptions } from './props.js';
import { closeDrawer } from './drawer.js';
import { handleNav, openChecklistEditor } from './shell.js';
import { openGuideModal } from './library.js';
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
        item.guide
          ? `<button type="button" class="btn btn-icon btn-icon-sm" data-ck-guide="${h(item.guide)}"
               title="How to test this" aria-label="How to test ${h(item.title)}">${icon.book(13)}</button>`
          : ''
      }
      ${
        item.wstgUrl
          ? `<a class="btn btn-icon btn-icon-sm" href="${h(item.wstgUrl)}" target="_blank" rel="noopener"
               title="${h(`${item.wstg} on wstg.owasp.org`)}" aria-label="Read ${h(item.wstg)} on wstg.owasp.org">${icon.external(
                 13
               )}</a>`
          : ''
      }
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
  const btn = document.querySelector('[data-tab="checklist"], [data-pjp-tab="checklist"]');
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
  // `item` is the server's row, but the note saves on blur: text typed a moment
  // before the click is not in it yet, and closing the box over someone's
  // half-written note is worse than leaving it open.
  const typed = wrap?.querySelector('[data-ck-note]')?.value.trim() || '';
  const hasNote = Boolean((item.note || '').trim()) || Boolean(item.fileId) || Boolean(typed);
  // Fail opens the note box, and moving back to Pass/Open/N/A closes it again —
  // unless a note or a file is already there, because that is work, not a hint.
  if (wrap) wrap.hidden = !(item.status === 'Fail' || hasNote);
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

  // The guide comes to the engagement as a dialog: leaving the checklist you are
  // half-way through to read one item is the wrong trade, and losing your place
  // is exactly what the old jump to /tests did.
  el.querySelectorAll('[data-ck-guide]').forEach((btn) =>
    btn.addEventListener('click', () => openGuideModal(btn.dataset.ckGuide))
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
   ------------------------------------------------------------
   The index is a table like every other catalogue page; one template is edited
   on its own page (`/admin/checklists/<id>`), because a real list is a hundred
   rows tall and a modal cannot hold it.
   ============================================================ */
/* ============================================================
   Admin panel → Checklists & Tests
   ------------------------------------------------------------
   The page is the categories, and each category lists the checklists written
   for it. A checklist opens on its own page, where its categories and the tests
   inside them are edited — one click, one job.

   The buckets come from Admin → Properties (`propOptions('category')`), the same
   list a project is filed under, so adding "MASTG" or "Thick client" there is all
   it takes to get a bucket here. No framework is named in this file.
   ============================================================ */

function checklistRowHTML(c) {
  const items = Number(c.itemCount) || 0;
  const used = Number(c.projectCount) || 0;
  const meta = [`${items} test${items === 1 ? '' : 's'}`];
  if (used) meta.push(`in ${used} project${used === 1 ? '' : 's'}`);
  return `<li class="ck-row">
    <button type="button" class="ck-row-main" data-ck-open="${c.id}">
      <span class="ck-row-name">${h(c.name)}${
        c.isDefault
          ? '<span class="badge badge-outline" data-tone="amber"><span class="dot"></span>default</span>'
          : ''
      }</span>
      ${c.description ? `<span class="ck-row-desc">${h(c.description)}</span>` : ''}
      <span class="ck-row-meta">${meta.join(' · ')}</span>
    </button>
    <span class="ck-row-acts">
      <button type="button" class="btn btn-icon btn-icon-danger" data-ck-del="${c.id}"
        title="${used ? `Attached to ${used} project${used === 1 ? '' : 's'} — detach it first` : 'Delete'}"
        aria-label="Delete ${h(c.name)}" ${used ? 'disabled' : ''}>${icon.trash(13)}</button>
    </span>
  </li>`;
}

function categorySectionHTML(label, rows) {
  return `<section class="admin-sec">
    <div class="admin-sec-head">
      <h3>${h(label)}</h3>
      <span class="admin-count">${rows.length}</span>
    </div>
    ${
      rows.length
        ? `<ul class="ck-list">${rows.map(checklistRowHTML).join('')}</ul>`
        : `<p class="note-line">Nothing here yet. A checklist filed under this category lands here.</p>`
    }
  </section>`;
}

/** Checklists bucketed by the category they are filed under. */
function catalogHTML(checklists) {
  const buckets = new Map(propOptions('category').map((o) => [o.value, []]));
  const loose = [];
  for (const c of checklists) {
    const key = String(c.category || '');
    if (buckets.has(key)) buckets.get(key).push(c);
    else loose.push(c);
  }
  const sections = [];
  for (const [value, rows] of buckets) {
    sections.push(categorySectionHTML(propLabel('category', value) || value || 'No category', rows));
  }
  if (loose.length) sections.push(categorySectionHTML('No category', loose));
  return sections.join('');
}

export function checklistsPageHTML() {
  return `<div class="admin">
    <div class="admin-head">
      <p>
        Every checklist sits under the category it was written for. Open one to see its
        categories and the tests inside them. A project links a checklist rather than
        copying it, so an edit here reaches every engagement at once.
      </p>
      <span class="admin-head-actions">
        <button class="btn btn-sm" data-go-guides>Test guides</button>
        <button class="btn btn-sm" data-catalog-new="checklists">${icon.plus(13)} Checklist</button>
      </span>
    </div>
    <div id="ck-admin-body"><div class="empty"><h3>Loading…</h3></div></div>
  </div>`;
}

function bindCatalog(checklists) {
  const host = document.getElementById('ck-admin-body');
  if (!host) return;
  host.querySelectorAll('[data-ck-open]').forEach((b) =>
    b.addEventListener('click', () => openChecklistEditor(Number(b.dataset.ckOpen)))
  );
  host.querySelectorAll('[data-ck-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = checklists.find((c) => Number(c.id) === Number(b.dataset.ckDel));
      if (!row) return;
      const items = Number(row.itemCount) || 0;
      const ok = await confirmDialog({
        title: 'Delete this checklist?',
        message: `"${row.name}" and its ${items} item${items === 1 ? '' : 's'} will be deleted. Projects that linked it lose the list.`,
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

export async function refreshChecklists() {
  const host = document.getElementById('ck-admin-body');
  if (!host) return;
  let checklists = [];
  try {
    ({ checklists } = await api.checklists());
  } catch (err) {
    host.innerHTML = `<div class="empty"><h3>Could not load the checklists</h3><p>${h(err.message)}</p></div>`;
    return;
  }
  host.innerHTML = checklists.length
    ? catalogHTML(checklists)
    : `<div class="empty"><h3>No checklists yet</h3><p>Write one item per line of the threat you are checking for, and every engagement can be measured against it.</p></div>`;
  bindCatalog(checklists);
  document
    .querySelector('[data-go-guides]')
    ?.addEventListener('click', () => handleNav('guides'), { once: true });
  document
    .querySelector('[data-catalog-new="checklists"]')
    ?.addEventListener('click', () => openChecklistEditor(null), { once: true });
}

/* ------------------------------------------------------------
   Admin panel → Test guides: the other half of a checklist, filed under the same
   categories, so "how it is tested" is found where "what must be tested" is.
   ------------------------------------------------------------ */

function guideRowHTML(g) {
  const asked = (g.asked || []).reduce((n, a) => n + Number(a.items || 0), 0);
  const meta = [
    g.code,
    g.wstg,
    asked ? `asked by ${asked} test${asked === 1 ? '' : 's'}` : 'not asked yet',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<li class="ck-row">
    <button type="button" class="ck-row-main" data-gd-edit="${h(g.id)}">
      <span class="ck-row-name">${h(g.title)}</span>
      ${g.checklistName ? `<span class="ck-row-desc">${h(g.checklistName)}</span>` : ''}
      <span class="ck-row-meta">${h(meta)}</span>
    </button>
    <span class="ck-row-acts">
      <button type="button" class="btn btn-icon btn-icon-danger" data-gd-del="${h(g.id)}"
        title="Delete" aria-label="Delete ${h(g.title)}">${icon.trash(13)}</button>
    </span>
  </li>`;
}

function guideSectionsHTML(guides) {
  const buckets = new Map(propOptions('category').map((o) => [o.value, []]));
  const loose = [];
  for (const g of guides) {
    const key = String(g.category || '');
    if (buckets.has(key)) buckets.get(key).push(g);
    else loose.push(g);
  }
  const sections = [];
  const paint = (label, rows) =>
    sections.push(`<section class="admin-sec">
      <div class="admin-sec-head"><h3>${h(label)}</h3><span class="admin-count">${rows.length}</span></div>
      <ul class="ck-list">${rows.map(guideRowHTML).join('')}</ul>
    </section>`);
  for (const [value, rows] of buckets) {
    if (rows.length) paint(propLabel('category', value) || value, rows);
  }
  if (loose.length) paint('No category', loose);
  return (
    sections.join('') ||
    `<div class="empty"><h3>No test guides yet</h3><p>Write how you test one part of a checklist: what to send, what passing looks like, and the mistakes that produce a false positive.</p></div>`
  );
}

export function guidesPageHTML() {
  return `<div class="admin">
    <div class="admin-head">
      <p>
        One guide per part of a checklist: what to send, what passing looks like, and the
        false positives to avoid. Deleting one is refused while a test still points at it.
      </p>
      <span class="admin-head-actions">
        <button class="btn btn-sm" data-catalog-new="guides">${icon.plus(13)} Test guide</button>
        <button class="btn btn-sm" data-catalog-new="wstg">WSTG data</button>
      </span>
    </div>
    <div id="gd-admin-body"><div class="empty"><h3>Loading…</h3></div></div>
  </div>`;
}

function bindGuides(guides, checklists, wstg) {
  const host = document.getElementById('gd-admin-body');
  if (!host) return;
  host.querySelectorAll('[data-gd-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const guide = guides.find((g) => g.id === b.dataset.gdEdit);
      if (guide) openGuideEditor(guide, checklists, wstg);
    })
  );
  host.querySelectorAll('[data-gd-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const guide = guides.find((g) => g.id === b.dataset.gdDel);
      if (!guide) return;
      const ok = await confirmDialog({
        title: 'Delete this test guide?',
        message: `"${guide.title}" will be deleted. A checklist row that points at it, or a built-in finding that cites it, will refuse the delete.`,
        confirmLabel: 'Delete guide',
      });
      if (!ok) return;
      try {
        await api.deleteGuide(guide.id);
        toast('Guide deleted');
        await refreshGuides();
      } catch (err) {
        toast(err.message, 'err');
      }
    })
  );
}

export async function refreshGuides() {
  const host = document.getElementById('gd-admin-body');
  if (!host) return;
  let guides = [];
  let wstg = [];
  let checklists = [];
  try {
    [{ guides, wstg }, { checklists }] = await Promise.all([api.tests(), api.checklists()]);
  } catch (err) {
    host.innerHTML = `<div class="empty"><h3>Could not load the guides</h3><p>${h(err.message)}</p></div>`;
    return;
  }
  host.innerHTML = guideSectionsHTML(guides);
  bindGuides(guides, checklists, wstg);
  document
    .querySelector('[data-catalog-new="guides"]')
    ?.addEventListener('click', () => openGuideEditor(null, checklists, wstg), { once: true });
  document
    .querySelector('[data-catalog-new="wstg"]')
    ?.addEventListener('click', () => handleNav('wstg'), { once: true });
}

/** One guide, in a dialog: six short fields and four lists, one line each. */
function openGuideEditor(guide, checklists, wstg = [], after = null) {
  const editing = Boolean(guide);
  const listOptions = [`<option value="">No checklist</option>`]
    .concat(
      checklists.map(
        (c) =>
          `<option value="${c.id}"${guide && Number(guide.checklistId) === c.id ? ' selected' : ''}>${h(
            c.name
          )}${c.category ? ` — ${h(c.category)}` : ''}</option>`
      )
    )
    .join('');
  const field = (id, label, value, multiline) =>
    `<div class="field">
       <label for="gd-${id}">${label}</label>
       ${
         multiline
           ? `<textarea id="gd-${id}" class="input" rows="4">${h(value || '')}</textarea>`
           : `<input id="gd-${id}" class="input" value="${h(value || '')}">`
       }
     </div>`;

  const body = `<div class="form-row">
      ${field('code', 'Code', guide?.code, false)}
      ${field('title', 'Title', guide?.title, false)}
      <div class="field">
        <label for="gd-checklist">Checklist</label>
        <select id="gd-checklist" class="input">${listOptions}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="field">
        <label for="gd-wstg">WSTG category</label>
        <select id="gd-wstg" class="input">
          <option value=""${guide?.wstg ? '' : ' selected'}>No citation</option>
          ${wstg
            .map(
              (c) =>
                `<option value="${h(c.code)}"${guide?.wstg === c.code ? ' selected' : ''}>${h(
                  c.code
                )} — ${h(c.title)}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="field">
        <span class="field-label">Where the citation points</span>
        ${
          guide?.wstgUrl
            ? `<a class="link-btn" href="${h(guide.wstgUrl)}" target="_blank" rel="noopener">${h(
                guide.wstg
              )}${icon.external(11)}</a>`
            : `<span class="note-line">The OWASP test cases this guide's work belongs to.</span>`
        }
      </div>
    </div>
    ${field('what', 'What this category means', guide?.what, true)}
    ${field('steps', 'Steps — one per line', (guide?.steps || []).join('\n'), true)}
    ${field('passes', 'This passes when — one per line', (guide?.passes || []).join('\n'), true)}
    ${field('tools', 'Tools — one per line', (guide?.tools || []).join('\n'), true)}
    ${field('watch', 'Do not over-call it — one per line', (guide?.watch || []).join('\n'), true)}
    <p class="note-line">The code is what a checklist section is matched against (<code>A01:2025</code>), so keep it in the same shape.</p>`;

  const modal = openModal({
    title: editing ? 'Edit test guide' : 'New test guide',
    subtitle: editing
      ? `${guide.code || 'No code'} · ${guide.checklistName || 'No checklist'}`
      : 'A guide nothing points at yet is still readable on the Tests page.',
    body,
    wide: true,
    footer: `<button class="btn" data-cancel>Cancel</button>
             <button class="btn btn-primary" data-save>${editing ? 'Save guide' : 'Create guide'}</button>`,
    initialFocus: '#gd-title',
  });

  const value = (id) => modal.modal.querySelector(`#gd-${id}`).value;
  const list = (id) =>
    value(id)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  modal.modal.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
  modal.modal.querySelector('[data-save]').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    const payload = {
      code: value('code').trim(),
      title: value('title').trim(),
      checklistId: value('checklist') || '',
      wstg: value('wstg') || '',
      what: value('what').trim(),
      steps: list('steps'),
      passes: list('passes'),
      tools: list('tools'),
      watch: list('watch'),
    };
    try {
      if (editing) await api.updateGuide(guide.id, payload);
      else await api.createGuide(payload);
      modal.close();
      toast(editing ? 'Guide saved' : 'Guide created');
      if (after) await after();
      else await refreshGuides();
    } catch (err) {
      event.currentTarget.disabled = false;
      toast(err.message, 'err');
    }
  });
}



/* ------------------------------------------------------------
   The WSTG, edited where it is read
   ------------------------------------------------------------
   Twelve categories and 116 test cases, as tables. It used to be a module, which
   meant a typo OWASP had already corrected on their own site needed a release
   from us — and a guide's citation, the checklist template and every project row
   all read from here, so a correction is one edit and one refresh.
   ------------------------------------------------------------ */

export function wstgPageHTML() {
  return `<div class="admin">
    <div class="admin-head">
      <p>
        The OWASP Web Security Testing Guide as published: its categories, and one
        row per test case with the page that publishes it. Every guide cites one of
        these categories, and the OWASP WSTG checklist is written from these rows.
      </p>
      <span class="admin-head-actions">
        <button class="btn btn-sm" data-catalog-new="wstg-category">${icon.plus(13)} Category</button>
        <button class="btn btn-sm" data-catalog-new="wstg-case">${icon.plus(13)} Test case</button>
      </span>
    </div>
    <div class="catalog-switch">
      <button class="chip" type="button" data-wstg-back>← Checklists &amp; Tests</button>
    </div>
    <div id="wstg-admin-body"><div class="empty"><h3>Loading…</h3></div></div>
  </div>`;
}

function wstgCategoryRowHTML(category, cases) {
  const held = cases.filter((c) => c.category === category.code);
  return `<tr data-wstg-cat-row="${h(category.code)}">
    <td class="dev-name">
      <button type="button" class="ck-open" data-wstg-cat-edit="${h(category.code)}">${h(category.code)}</button>
      <span class="ck-sub">${h(category.title)}</span>
    </td>
    <td class="dev-mono-cell">${h(category.dir)}</td>
    <td class="dev-mono-cell">${held.length}</td>
    <td class="dev-acts"><span class="dev-acts-inner">
      <button type="button" class="btn btn-icon" data-wstg-cat-edit="${h(category.code)}"
        title="Edit" aria-label="Edit ${h(category.code)}">${icon.edit(13)}</button>
      <button type="button" class="btn btn-icon btn-icon-danger" data-wstg-cat-del="${h(category.code)}"
        title="Delete" aria-label="Delete ${h(category.code)}">${icon.trash(13)}</button>
    </span></td>
  </tr>`;
}

function wstgCaseRowHTML(one) {
  return `<tr data-wstg-case-row="${h(one.code)}">
    <td class="dev-name">
      <button type="button" class="ck-open" data-wstg-case-edit="${h(one.code)}">${h(one.title)}</button>
      <span class="ck-sub">${h(one.code)}</span>
    </td>
    <td class="dev-mono-cell">${h(one.category)}</td>
    <td class="dev-mono-cell"><a class="link-btn" href="${h(one.url)}" target="_blank" rel="noopener"
      title="Read it on wstg.owasp.org">${h(one.slug)}${icon.external(11)}</a></td>
    <td class="dev-acts"><span class="dev-acts-inner">
      <button type="button" class="btn btn-icon" data-wstg-case-edit="${h(one.code)}"
        title="Edit" aria-label="Edit ${h(one.code)}">${icon.edit(13)}</button>
      <button type="button" class="btn btn-icon btn-icon-danger" data-wstg-case-del="${h(one.code)}"
        title="Delete" aria-label="Delete ${h(one.code)}">${icon.trash(13)}</button>
    </span></td>
  </tr>`;
}

function wstgSectionsHTML({ categories, cases }) {
  return `<section class="admin-sec">
    <div class="admin-sec-head">
      <h3>Categories</h3>
      <span class="admin-count">${categories.length}</span>
      <p>A category is what a guide cites. Deleting one is refused while it holds cases or a guide names it.</p>
    </div>
    <div class="dev-tablewrap">
      <table class="dev-table">
        <thead><tr>
          <th class="dev-h-label"><span class="dev-h-inner"><span class="dev-h-label">Category</span></span></th>
          <th class="dev-h-key"><span class="dev-h-inner"><span class="dev-h-label">Directory</span></span></th>
          <th class="dev-h-key"><span class="dev-h-inner"><span class="dev-h-label">Cases</span></span></th>
          <th class="dev-h-acts"><span class="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>${categories.map((c) => wstgCategoryRowHTML(c, cases)).join('')}</tbody>
      </table>
    </div>
  </section>
  <section class="admin-sec">
    <div class="admin-sec-head">
      <h3>Test cases</h3>
      <span class="admin-count">${cases.length}</span>
      <p>The OWASP WSTG checklist is written from these rows, so a case a checklist row already asks about cannot be deleted.</p>
    </div>
    <div class="dev-tablewrap">
      <table class="dev-table">
        <thead><tr>
          <th class="dev-h-label"><span class="dev-h-inner"><span class="dev-h-label">Test case</span></span></th>
          <th class="dev-h-key"><span class="dev-h-inner"><span class="dev-h-label">Category</span></span></th>
          <th class="dev-h-key"><span class="dev-h-inner"><span class="dev-h-label">Page</span></span></th>
          <th class="dev-h-acts"><span class="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>${cases.map(wstgCaseRowHTML).join('')}</tbody>
      </table>
    </div>
  </section>`;
}

export async function refreshWstg() {
  const host = document.getElementById('wstg-admin-body');
  if (!host) return;
  document
    .querySelector('[data-wstg-back]')
    ?.addEventListener('click', () => handleNav('checklists'), { once: true });
  let wstg = { categories: [], cases: [] };
  try {
    wstg = await api.wstg();
  } catch (err) {
    host.innerHTML = `<div class="empty"><h3>Could not load the WSTG</h3><p>${h(err.message)}</p></div>`;
    return;
  }

  host.innerHTML = wstgSectionsHTML(wstg);
  document
    .querySelector('[data-catalog-new="wstg-category"]')
    ?.addEventListener('click', () => openWstgCategoryEditor(null), { once: true });
  document
    .querySelector('[data-catalog-new="wstg-case"]')
    ?.addEventListener('click', () => openWstgCaseEditor(null, wstg.categories), { once: true });

  host.querySelectorAll('[data-wstg-cat-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const row = wstg.categories.find((c) => c.code === b.dataset.wstgCatEdit);
      if (row) openWstgCategoryEditor(row);
    })
  );
  host.querySelectorAll('[data-wstg-cat-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = wstg.categories.find((c) => c.code === b.dataset.wstgCatDel);
      if (!row) return;
      const ok = await confirmDialog({
        title: `Delete ${row.code}?`,
        message: `"${row.title}" will be removed from the WSTG. A category that still holds test cases, or that a guide cites, refuses the delete.`,
        confirmLabel: 'Delete category',
      });
      if (!ok) return;
      try {
        await api.deleteWstgCategory(row.code);
        toast('Category deleted');
        await refreshWstg();
      } catch (err) {
        toast(err.message, 'err');
      }
    })
  );
  host.querySelectorAll('[data-wstg-case-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const row = wstg.cases.find((c) => c.code === b.dataset.wstgCaseEdit);
      if (row) openWstgCaseEditor(row, wstg.categories);
    })
  );
  host.querySelectorAll('[data-wstg-case-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = wstg.cases.find((c) => c.code === b.dataset.wstgCaseDel);
      if (!row) return;
      const ok = await confirmDialog({
        title: 'Delete this test case?',
        message: `"${row.code} ${row.title}" will be removed from the WSTG, and from the method as this app publishes it. A case a checklist row already asks about refuses the delete.`,
        confirmLabel: 'Delete case',
      });
      if (!ok) return;
      try {
        await api.deleteWstgCase(row.code);
        toast('Test case deleted');
        await refreshWstg();
      } catch (err) {
        toast(err.message, 'err');
      }
    })
  );
}

function wstgCategoryEditorBody(row) {
  const field = (id, label, value, readOnly) =>
    `<div class="field">
       <label for="wc-${id}">${label}</label>
       <input id="wc-${id}" class="input" value="${h(value || '')}"${
         readOnly ? ' readonly' : ''
       }>
     </div>`;
  return `<div class="form-row">
      ${field('code', 'Code', row?.code || 'WSTG-', Boolean(row))}
      ${field('title', 'Title', row?.title || '')}
    </div>
    ${field('dir', 'Directory on wstg.owasp.org', row?.dir || '')}
    <p class="note-line">The code is what a guide cites and what a checklist section is named, so it cannot be renamed. The directory is the folder the case pages live in, like <code>05-Authorization</code>.</p>`;
}

function openWstgCategoryEditor(row) {
  const editing = Boolean(row);
  const modal = openModal({
    title: editing ? 'Edit WSTG category' : 'New WSTG category',
    subtitle: editing ? row.code : 'A category a guide can cite',
    body: wstgCategoryEditorBody(row),
    footer: `<button class="btn" data-cancel>Cancel</button>
             <button class="btn btn-primary" data-save>${editing ? 'Save category' : 'Create category'}</button>`,
    initialFocus: editing ? '#wc-title' : '#wc-code',
  });
  const value = (id) => modal.modal.querySelector(`#wc-${id}`).value.trim();
  modal.modal.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
  modal.modal.querySelector('[data-save]').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      if (editing) {
        await api.updateWstgCategory(row.code, { title: value('title'), dir: value('dir') });
      } else {
        await api.createWstgCategory({ code: value('code'), title: value('title'), dir: value('dir') });
      }
      modal.close();
      toast(editing ? 'Category saved' : 'Category created');
      await refreshWstg();
    } catch (err) {
      event.currentTarget.disabled = false;
      toast(err.message, 'err');
    }
  });
}

function openWstgCaseEditor(row, categories) {
  const editing = Boolean(row);
  const options = categories
    .map(
      (c) =>
        `<option value="${h(c.code)}"${
          row && row.category === c.code ? ' selected' : ''
        }>${h(c.code)} — ${h(c.title)}</option>`
    )
    .join('');
  const body = `<div class="form-row">
      <div class="field">
        <label for="ww-code">Code</label>
        <input id="ww-code" class="input" value="${h(row?.code || 'WSTG-')}"${editing ? ' readonly' : ''}>
      </div>
      <div class="field">
        <label for="ww-category">Category</label>
        <select id="ww-category" class="input">${options}</select>
      </div>
    </div>
    <div class="field">
      <label for="ww-title">Title</label>
      <input id="ww-title" class="input" value="${h(row?.title || '')}">
    </div>
    <div class="field">
      <label for="ww-slug">Page slug</label>
      <input id="ww-slug" class="input" value="${h(row?.slug || '')}">
    </div>
    <p class="note-line">The slug is the page name OWASP publishes, like <code>04-Insecure_Direct_Object_References</code> — copy it from the URL rather than from the title. A checklist row titled with the code (<code>WSTG-ATHZ-04 …</code>) links straight to it.</p>`;

  const modal = openModal({
    title: editing ? 'Edit WSTG test case' : 'New WSTG test case',
    subtitle: editing ? row.code : 'One published test case',
    body,
    wide: true,
    footer: `<button class="btn" data-cancel>Cancel</button>
             <button class="btn btn-primary" data-save>${editing ? 'Save case' : 'Create case'}</button>`,
    initialFocus: '#ww-title',
  });
  const value = (id) => modal.modal.querySelector(`#ww-${id}`).value.trim();
  modal.modal.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
  modal.modal.querySelector('[data-save]').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    const payload = {
      code: value('code'),
      categoryCode: value('category'),
      title: value('title'),
      slug: value('slug'),
    };
    try {
      if (editing) await api.updateWstgCase(row.code, payload);
      else await api.createWstgCase(payload);
      modal.close();
      toast(editing ? 'Test case saved' : 'Test case created');
      await refreshWstg();
    } catch (err) {
      event.currentTarget.disabled = false;
      toast(err.message, 'err');
    }
  });
}

/* One template, on its own page */
export function checklistEditorHTML() {
  return `<div class="cke"><div id="cke-body"><div class="empty"><h3>Loading…</h3></div></div></div>`;
}

// The page is re-rendered from this array whenever the structure changes (add,
// delete, move, re-group), so typing never fights a repaint: only structural
// actions repaint, and every text field writes back on `input`.
let editor = null;
// The guides, checklists and WSTG categories the editor needs: a test row shows the
// guide that teaches it, and editing that guide has to offer the same vocabulary.
let editorGuides = new Map();
let editorChecklists = [];
let editorWstg = [];

function emptyEditor() {
  return {
    id: null,
    name: '',
    description: '',
    category: '',
    isDefault: false,
    rows: [],
    removed: new Set(),
    collapsed: new Set(),
  };
}

function editorGroups() {
  const groups = new Map();
  editor.rows.forEach((row, index) => {
    const key = (row.section || '').trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  return groups;
}

/**
 * An item is a group — “WSTG-INFO — Information Gathering” — and the rows under it
 * are its sub-items — “WSTG-INFO-01 Conduct Search Engine Reconnaissance…”. The
 * group's name is the row's section, so a sub-item is moved by being made in another
 * item; there is no second field to keep in step.
 */
function editorItemHTML(row, index) {
  const guide = row.guide ? editorGuides.get(row.guide) : null;
  return `<div class="cke-item" data-idx="${index}">
    <div class="cke-item-main">
      <input class="input cke-title" data-f="title" value="${h(row.title || '')}"
        placeholder="Sub item — WSTG-INFO-01 Conduct Search Engine Reconnaissance…" aria-label="Sub item" autocomplete="off" />
      <input class="input cke-help" data-f="help" value="${h(row.help || '')}"
        placeholder="How to check it (optional)" aria-label="How to check it" autocomplete="off" />
    </div>
    <div class="cke-item-side">
      ${
        guide
          ? `<button type="button" class="btn btn-icon btn-icon-sm cke-guide-btn" data-guide-edit="${h(guide.id)}"
              title="Edit the test guide: ${h(guide.title)}" aria-label="Edit the test guide">${icon.book(12)}</button>`
          : ''
      }
      <span class="cke-acts">
        <button type="button" class="btn btn-icon btn-icon-sm" data-act="up" title="Move up" aria-label="Move up">${icon.arrowUp(
          12
        )}</button>
        <button type="button" class="btn btn-icon btn-icon-sm" data-act="down" title="Move down" aria-label="Move down">${icon.arrowDown(
          12
        )}</button>
        <button type="button" class="btn btn-icon btn-icon-sm btn-icon-danger" data-act="del" title="Delete this sub item" aria-label="Delete this sub item">${icon.trash(
          12
        )}</button>
      </span>
    </div>
  </div>`;
}

function editorListHTML() {
  if (!editor.rows.length) {
    return `<div class="cke-empty">
      <div class="icon">${icon.shield(22)}</div>
      <h3>No items yet</h3>
      <p>An <strong>item</strong> is a group of checks, a <strong>sub item</strong> is one check:
        item “WSTG-INFO — Information Gathering”, sub item “WSTG-INFO-01 …”. Add an item, then its
        sub items — or paste a list — <code>Item | Sub item | How to check it</code>.</p>
    </div>`;
  }
  const groups = editorGroups();
  return [...groups.entries()]
    .map(([section, indexes]) => {
      const open = !editor.collapsed.has(section);
      const count = `${indexes.length} sub item${indexes.length === 1 ? '' : 's'}`;
      return `<section class="cke-sec" data-sec="${h(section)}">
        <div class="cke-sec-head">
          <button type="button" class="cke-sec-toggle" data-sec-toggle aria-expanded="${open}"
            title="${open ? 'Hide' : 'Show'} the sub items" aria-label="${open ? 'Hide' : 'Show'} the sub items">${
              open ? icon.chevronDown(13) : icon.chevronRight(13)
            }</button>
          <input class="input cke-sec-name" data-sec-name value="${h(section)}"
            placeholder="Item name" aria-label="Item name" autocomplete="off" />
          <span class="cke-sec-count">${count}</span>
          <span class="spacer"></span>
          <button type="button" class="btn btn-sm btn-ghost" data-add-sec="${h(section)}">${icon.plus(
            12
          )} sub item</button>
          <button type="button" class="btn btn-icon btn-icon-sm btn-icon-danger" data-sec-del="${h(section)}"
            title="Delete this item" aria-label="Delete this item">${icon.trash(12)}</button>
        </div>
        ${open ? indexes.map((i) => editorItemHTML(editor.rows[i], i)).join('') : ''}
      </section>`;
    })
    .join('');
}

function editorBodyHTML() {
  const editing = Boolean(editor.id);
  return `<div class="cke-bar">
      <button type="button" class="btn btn-ghost btn-sm" data-cke-back>${icon.arrowLeft(13)} Checklists</button>
      <span class="spacer"></span>
      <span class="cke-state" id="cke-state"></span>
      <button type="button" class="btn btn-primary" data-cke-save>${editing ? 'Save changes' : 'Create checklist'}</button>
    </div>
    <div class="cke-head">
      <input class="input cke-name" id="cke-name" value="${h(editor.name)}" autocomplete="off"
        placeholder="Checklist name" aria-label="Checklist name" />
      <input class="input" id="cke-desc" value="${h(editor.description || '')}" autocomplete="off"
        placeholder="One line on what this list is for (optional)" aria-label="Description" />
      <div class="cke-meta">
        <label class="cke-field">
          <span class="field-label">Category</span>
          <select class="input" id="cke-cat">${categoryOptions(editor.category)}</select>
        </label>
        <label class="switch-row cke-default">
          <input type="checkbox" id="cke-def"${editor.isDefault ? ' checked' : ''} />
          <span>Attach it to a new project of this category on its own</span>
        </label>
        <span class="spacer"></span>
        ${
          editing
            ? `<button type="button" class="btn btn-sm btn-danger-ghost" data-cke-del>${icon.trash(13)} Delete</button>`
            : ''
        }
      </div>
    </div>
    <div class="cke-tools">
      <button type="button" class="btn btn-sm" data-cke-add>${icon.plus(13)} Item</button>
      <button type="button" class="btn btn-sm btn-ghost" data-cke-paste-open>Paste a list</button>
      <span class="spacer"></span>
      <span class="cke-total" id="cke-total"></span>
    </div>
    <div class="ck-paste" hidden>
      <textarea class="input mono" id="cke-paste" rows="4"
        placeholder="Item | Sub item | How to check it"></textarea>
      <div class="ck-paste-foot">
        <span class="form-hint">One sub item per line. Two columns read as <code>sub item | help</code>.</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm" data-cke-paste-apply>Add these</button>
      </div>
    </div>
    <div class="cke-list" id="cke-list">${editorListHTML()}</div>`;
}

export async function mountChecklistEditor() {
  const host = document.getElementById('cke-body');
  if (!host) return;
  const id = state.checklistEditId ? Number(state.checklistEditId) : null;
  editor = emptyEditor();
  if (id) {
    try {
      const [{ checklist }, { guides, wstg }, { checklists }] = await Promise.all([
        api.checklist(id),
        api.tests(),
        api.checklists(),
      ]);
      editorGuides = new Map(guides.map((guide) => [guide.id, guide]));
      editorChecklists = checklists;
      editorWstg = wstg;
      editor = {
        id: checklist.id,
        name: checklist.name || '',
        description: checklist.description || '',
        category: checklist.category || '',
        isDefault: Boolean(checklist.isDefault),
        rows: (checklist.items || []).map((item) => ({
          id: Number(item.id),
          section: item.section || '',
          title: item.title || '',
          help: item.help || '',
          guide: item.guide || '',
          orig: { section: item.section || '', title: item.title || '', help: item.help || '' },
        })),
        removed: new Set(),
        collapsed: new Set(),
      };
    } catch (err) {
      toast(err.message, 'err');
      handleNav('checklists');
      return;
    }
  }
  paintEditor();
}

/** "12 items · 116 sub items" — an item is a group, the rows are its sub items. */
function editorCounts() {
  const subItems = editor.rows.filter((row) => (row.title || '').trim()).length;
  const items = editorGroups().size;
  return `${items} item${items === 1 ? '' : 's'} · ${subItems} sub item${subItems === 1 ? '' : 's'}`;
}

function paintEditor() {
  const host = document.getElementById('cke-body');
  if (!host || !editor) return;
  host.innerHTML = editorBodyHTML();
  bindEditor(host);
  const total = host.querySelector('#cke-total');
  if (total) {
    total.textContent = editorCounts();
  }
  const state_ = host.querySelector('#cke-state');
  if (state_) state_.textContent = editor.id ? '' : 'Not saved yet';
}

function bindEditor(host) {
  const list = host.querySelector('#cke-list');

  // Structural actions repaint; typing does not.
  const repaintList = () => {
    list.innerHTML = editorListHTML();
    bindRows();
    const total = host.querySelector('#cke-total');
    if (total) {
      total.textContent = editorCounts();
    }
  };

  // A new row goes where the button is — after the last row of its section — and
  // the page scrolls to it. A list of 116 rows is longer than the screen, and a
  // row appended at the bottom looked like the button had done nothing at all.
  const addRow = (section = '', afterIndex = null) => {
    const row = { id: null, section, title: '', help: '' };
    const at = afterIndex === null ? editor.rows.length : afterIndex + 1;
    editor.rows.splice(at, 0, row);
    repaintList();
    const el = list.querySelector(`.cke-item[data-idx="${at}"] .cke-title`);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  };

  /**
   * Pasting a whole list into a row splits it: the row you pasted into is replaced
   * (or followed) by one row per line, so the list goes in without opening the
   * paste panel. A one-line paste is left to the field itself.
   */
  const pasteList = (event, index) => {
    const data = event.clipboardData?.getData('text') || '';
    if (!/\n/.test(data.trim())) return;
    const parsed = parsePasted(data);
    if (!parsed.length) return;
    event.preventDefault();
    const here = editor.rows[index] || { section: '' };
    const section = (here.section || '').trim();
    const rows = parsed.map((entry) => ({ id: null, ...entry, section: entry.section || section }));
    const empty = !(here.title || '').trim() && !(here.help || '').trim();
    const at = empty ? index : index + 1;
    editor.rows.splice(at, empty ? 1 : 0, ...rows);
    repaintList();
    list.querySelector(`.cke-item[data-idx="${at}"] .cke-title`)?.scrollIntoView({ block: 'center' });
    toast(`${rows.length} item${rows.length === 1 ? '' : 's'} added — remember to save`);
  };

  const lastIndexOfSection = (section) => {
    let last = -1;
    editor.rows.forEach((row, i) => {
      if ((row.section || '').trim() === section) last = i;
    });
    return last;
  };

  function bindRows() {
    list.querySelectorAll('.cke-item').forEach((el) => {
      const index = Number(el.dataset.idx);
      // A sub item that has a guide can open it; the row keeps its own text either way.
      el.querySelector('[data-guide-edit]')?.addEventListener('click', (event) => {
        const guide = editorGuides.get(event.currentTarget.dataset.guideEdit);
        if (guide) openGuideEditor(guide, editorChecklists, editorWstg, repaintList);
      });
      el.querySelectorAll('[data-f]').forEach((input) => {
        const field = input.dataset.f;
        input.addEventListener('input', () => {
          if (!editor.rows[index]) return;
          editor.rows[index][field] = input.value;
        });
        input.addEventListener('paste', (event) => pasteList(event, index));
      });
      el.querySelector('[data-act="del"]')?.addEventListener('click', () => {
        const row = editor.rows[index];
        if (row?.id) editor.removed.add(row.id);
        editor.rows.splice(index, 1);
        repaintList();
      });
      el.querySelector('[data-act="up"]')?.addEventListener('click', () => moveWithin(index, -1));
      el.querySelector('[data-act="down"]')?.addEventListener('click', () => moveWithin(index, +1));
    });
    list.querySelectorAll('[data-sec-toggle]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const section = btn.closest('.cke-sec')?.dataset.sec || '';
        if (editor.collapsed.has(section)) editor.collapsed.delete(section);
        else editor.collapsed.add(section);
        repaintList();
      })
    );

    list.querySelectorAll('[data-sec-name]').forEach((input) =>
      input.addEventListener('change', () => {
        const from = input.closest('.cke-sec')?.dataset.sec || '';
        const to = input.value.trim();
        if (to === from) {
          input.value = from;
          return;
        }
        // The item's name is the row's section, so renaming the item renames it on
        // every sub item it holds — including ones the panel is not showing.
        editor.rows.forEach((row) => {
          if ((row.section || '').trim() === from) row.section = to;
        });
        if (editor.collapsed.delete(from)) editor.collapsed.add(to);
        repaintList();
      })
    );

    list.querySelectorAll('[data-sec-del]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const section = btn.dataset.secDel || '';
        const held = editor.rows.filter((row) => (row.section || '').trim() === section);
        const ok = await confirmDialog({
          title: 'Delete this item?',
          message: held.length
            ? `"${section || 'No item'}" and its ${held.length} sub item${
                held.length === 1 ? '' : 's'
              } will be deleted.`
            : 'This item holds no sub items.',
          confirmLabel: 'Delete item',
        });
        if (!ok) return;
        held.forEach((row) => {
          if (row.id) editor.removed.add(row.id);
        });
        editor.rows = editor.rows.filter((row) => (row.section || '').trim() !== section);
        repaintList();
      })
    );

    list.querySelectorAll('[data-add-sec]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const section = btn.dataset.addSec || '';
        if (editor.collapsed.has(section)) {
          editor.collapsed.delete(section);
          repaintList();
        }
        addRow(section, lastIndexOfSection(section));
      })
    );
  }

  // Up/down move an item among the ones sharing its section: moving into the
  // block above would look like the row teleported to another group.
  function moveWithin(index, step) {
    const section = (editor.rows[index]?.section || '').trim();
    let target = index + step;
    while (target >= 0 && target < editor.rows.length) {
      if ((editor.rows[target].section || '').trim() === section) {
        const [row] = editor.rows.splice(index, 1);
        editor.rows.splice(target, 0, row);
        repaintList();
        return;
      }
      target += step;
    }
  }

  bindRows();

  // "+ Item" makes a group, not a row: the name is asked for once, then a group with
  // one empty sub item to type into. Naming an item that exists just adds to it.
  host.querySelector('[data-cke-add]')?.addEventListener('click', () => {
    const names = [...editorGroups().keys()].filter(Boolean);
    openModal({
      title: 'New item',
      subtitle: 'A group of checks — its name is the section every sub item under it carries.',
      body: `<div class="field"><label for="cke-new-item">Item</label>
        <input class="input" id="cke-new-item" autocomplete="off"
          placeholder="WSTG-INFO — Information Gathering" list="cke-item-names" />
        <datalist id="cke-item-names">${names.map((n) => `<option value="${h(n)}"></option>`).join('')}</datalist>
        <span class="form-hint">Naming an item that already exists adds a sub item to it.</span></div>`,
      footer: `<button class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" data-create-item>Add item</button>`,
      onMount(modal, close) {
        const input = modal.querySelector('#cke-new-item');
        input.focus();
        const create = () => {
          const name = input.value.trim();
          if (!name) {
            toast('An item needs a name', 'err');
            return;
          }
          close();
          editor.collapsed.delete(name);
          if (editorGroups().has(name)) addRow(name, lastIndexOfSection(name));
          else addRow(name, editor.rows.length - 1);
        };
        modal.querySelector('[data-create-item]').addEventListener('click', create);
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') create();
        });
      },
    });
  });
  host.querySelector('[data-cke-paste-open]')?.addEventListener('click', () => {
    const box = host.querySelector('.ck-paste');
    box.hidden = !box.hidden;
    if (!box.hidden) host.querySelector('#cke-paste').focus();
  });
  host.querySelector('[data-cke-paste-apply]')?.addEventListener('click', () => {
    const area = host.querySelector('#cke-paste');
    const parsed = parsePasted(area.value);
    if (!parsed.length) {
      toast('Nothing to add — use "Item | Sub item | How to check it" per line', 'err');
      return;
    }
    parsed.forEach((item) => editor.rows.push({ id: null, ...item }));
    area.value = '';
    repaintList();
    toast(`${parsed.length} item${parsed.length === 1 ? '' : 's'} added — remember to save`);
  });
  host.querySelector('[data-cke-back]')?.addEventListener('click', () => handleNav('checklists'));

  host.querySelector('[data-cke-del]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete checklist?',
      message: `"${editor.name}" and its ${editor.rows.length} item${
        editor.rows.length === 1 ? '' : 's'
      } will be deleted. A project that links it keeps you from deleting it by mistake.`,
      confirmLabel: 'Delete checklist',
    });
    if (!ok) return;
    try {
      await api.deleteChecklist(editor.id);
      toast('Checklist deleted');
      handleNav('checklists');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  host.querySelector('[data-cke-save]')?.addEventListener('click', async () => {
    const name = host.querySelector('#cke-name').value.trim();
    const description = host.querySelector('#cke-desc').value.trim();
    const category = host.querySelector('#cke-cat').value;
    const isDefault = host.querySelector('#cke-def').checked;
    if (!name) {
      toast('A checklist needs a name', 'err');
      host.querySelector('#cke-name').focus();
      return;
    }
    if (!category && isDefault) {
      toast('Pick a category before making this the default', 'err');
      host.querySelector('#cke-cat').focus();
      return;
    }
    const save = host.querySelector('[data-cke-save]');
    save.disabled = true;
    try {
      let targetId = editor.id;
      const meta = { name, description, category, isDefault };
      if (targetId) await api.updateChecklist(targetId, meta);
      else targetId = (await api.createChecklist(meta)).checklist.id;

      for (const itemId of editor.removed) await api.deleteChecklistItem(itemId);

      // Positions are rewritten from the array order, so a reorder is a real
      // reorder even when nothing else changed.
      const fresh = [];
      for (let i = 0; i < editor.rows.length; i += 1) {
        const row = editor.rows[i];
        const title = (row.title || '').trim();
        if (!title) continue;
        const next = { section: (row.section || '').trim(), title, help: (row.help || '').trim(), position: i };
        if (!row.id) {
          fresh.push(next);
          continue;
        }
        const before = row.orig || { section: '', title: '', help: '' };
        const moved = before.section !== next.section || before.title !== next.title || before.help !== next.help;
        if (moved || row.position !== i) await api.updateChecklistItem(row.id, next);
      }
      if (fresh.length) {
        // The bulk insert appends, so its positions are placeholders: put each new
        // row where the list says it belongs.
        const created = (await api.createChecklistItems(targetId, fresh)).items || [];
        for (let k = 0; k < created.length; k += 1) {
          const target = fresh[k]?.position;
          if (target !== null && target !== undefined) await api.updateChecklistItem(created[k].id, { position: target });
        }
      }

      toast(editor.id ? 'Checklist saved' : 'Checklist created');
      handleNav('checklists');
    } catch (err) {
      toast(err.message, 'err');
      save.disabled = false;
    }
  });
}


/**
 * `Section | What to check | How to check it`, one item per line.
 *
 * Two columns are ambiguous — `Title | Help` is what one pasted row looks like —
 * so a list where most lines carry three columns is read as `Section | Title`
 * for the short ones: the shape of the whole list decides, not a guess per line.
 */
export function parsePasted(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const sectioned = lines.filter((line) => line.split('|').length >= 3).length * 2 > lines.length;
  return (
    lines
      .map((line) => {
        const parts = line.split('|').map((p) => p.trim());
        if (parts.length >= 3) return { section: parts[0], title: parts[1], help: parts.slice(2).join(' | ') };
        if (parts.length === 2) {
          return sectioned
            ? { section: parts[0], title: parts[1], help: '' }
            : { section: '', title: parts[0], help: parts[1] };
        }
        return { section: '', title: parts[0], help: '' };
      })
      // A section with no title is a header line, not an item.
      .filter((item) => item.title)
  );
}
