import { api } from './api.js';
import { icon } from './icons.js';
import { canManageCatalog } from './state.js';
import { confirmDialog, escapeHtml as h, fmtRelative, openModal, toast } from './ui.js';

/* ============================================================
   Findings on one engagement
   ------------------------------------------------------------
   The library on /findings is our method: fixed text, one row per risk. This tab
   is the deliverable: what THIS project's tester actually found, how bad it is,
   and what to do about it. A row can start from a library entry — the form fills
   itself from one — and is then edited here, because what was found is never
   exactly what the template describes.

   Severity is NOT a dropdown: it is likelihood × impact, banded by the matrix the
   server serves at /api/risk-matrix (server/risk.js owns the thresholds). The form
   therefore asks the two questions a tester can actually answer, and shows the
   band it lands in — so a reader can see the score, not just the word.

   Severity and status reuse the library's vocabulary and the library's chips
   (`.lib-sev` + the same four tones) rather than growing a second colour code
   for the same four words.
   ============================================================ */

const SEVERITY_TONE = { Critical: 'rose', High: 'amber', Medium: 'blue', Low: 'slate' };
const STATUSES = ['Open', 'Fixed', 'Accepted'];

/** The library, fetched once per page load: the form's "copy from" list. */
let libraryCache = null;
async function library() {
  if (libraryCache) return libraryCache;
  try {
    libraryCache = (await api.findings()).findings || [];
  } catch {
    // A form without a starting point is still a working form; a form that
    // refuses to open because a read failed is not.
    libraryCache = [];
  }
  return libraryCache;
}


/**
 * The matrix, fetched once per page load.
 *
 * Not cached in code: a band threshold is a policy decision, and the day it moves
 * it must move in one file (server/risk.js) rather than in two that disagree.
 */
let riskCache = null;
async function risk() {
  if (riskCache) return riskCache;
  try {
    riskCache = await api.riskMatrix();
  } catch {
    riskCache = null;
  }
  return riskCache;
}

function severityFor(matrix, likelihood, impactScore) {
  const row = matrix.grid[likelihood - 1];
  return row ? row[impactScore - 1] : '';
}

/**
 * The pair to start a library entry from: the diagonal cell inside its band.
 *
 * A library finding carries a severity but no rating, and inventing "most likely"
 * would put words in the tester's mouth. The diagonal is the cheapest honest
 * placeholder — it lands in the same band — and the hint says what it is.
 */
function ratingsFor(matrix, severity) {
  for (let level = 1; level <= 5; level += 1) {
    if (matrix.grid[level - 1][level - 1] === severity) {
      return { likelihood: level, impactScore: level };
    }
  }
  return { likelihood: 3, impactScore: 3 };
}

/** The library entry a row cites, if it still exists — the search box's value. */
function pickedTitle(f, lib) {
  const found = f.template ? lib.find((l) => l.id === f.template) : null;
  return found ? found.title : '';
}

/**
 * One row in the library search: what it is, how bad, and which area — the three
 * things a tester scans to tell two similar entries apart.
 */
function libOptionHTML(l) {
  return `<button type="button" class="lib-item pf-lib-opt" data-pf-lib-opt="${h(l.id)}" role="option">
      ${sevChip(l.severity)}
      <span class="lib-item-body">
        <span class="lib-item-title">${h(l.title)}</span>
        <span class="lib-item-sub">${h([l.area, l.cwe].filter(Boolean).join(' · '))}</span>
      </span>
    </button>`;
}

const LIB_LIMIT = 8;

function sevChip(severity) {
  return `<span class="lib-sev" data-tone="${SEVERITY_TONE[severity] || 'slate'}">${h(severity)}</span>`;
}

function statusChip(f) {
  const tone = f.status === 'Fixed' ? 'cyan' : f.status === 'Accepted' ? 'slate' : 'amber';
  return `<span class="badge badge-outline" data-tone="${tone}">${h(f.status)}</span>`;
}


export function projectFindingsHTML(items) {
  const rows = items || [];
  const open = rows.filter((f) => f.status === 'Open').length;
  return `<div class="section-head">
      <h3>Findings</h3>
      <span class="badge badge-outline">${rows.length}${open ? ` · ${open} open` : ''}</span>
      <span class="spacer"></span>
      <button type="button" class="btn btn-sm" data-pf-new>${icon.plus(13)} New finding</button>
    </div>
    ${
      rows.length
        ? `<div class="dev-tablewrap">
             <table class="dev-table">
               <thead><tr>
                 <th class="dev-h-label"><span class="dev-h-inner"><span class="dev-h-label">Finding</span></span></th>
                 <th class="dev-h-sev"><span class="dev-h-inner"><span class="dev-h-label">Severity</span></span></th>
                 <th class="dev-h-status"><span class="dev-h-inner"><span class="dev-h-label">Status</span></span></th>
                 <th class="dev-h-acts"><span class="sr-only">Actions</span></th>
               </tr></thead>
               <tbody>${rows.map((f) => findingRowHTML(f)).join('')}</tbody>
             </table>
           </div>`
        : `<div class="empty">
             <div class="icon">${icon.alert(24)}</div>
             <h3>Nothing recorded yet</h3>
             <p>A finding here is a claim we make to the client: what it is, how bad, and how to fix it. The reference library is on the Findings page if you want a starting point.</p>
             <button type="button" class="btn btn-primary" data-pf-new>${icon.plus(13)} New finding</button>
           </div>`
    }`;
}


function findingRowHTML(f) {
  return `<tr data-pf-row="${f.id}">
    <td class="dev-name">
      <button type="button" class="ck-open" data-pf-edit="${f.id}">${h(f.title)}</button>
      ${
        // The rating behind the chip, so the number can be checked: "3 × 4" is a
        // question a reader can argue with, "High" is not. A row filed before the
        // matrix existed has no rating and says so rather than showing 0 × 0.
        `<span class="ck-sub">${
          f.likelihood && f.impactScore
            ? `${f.likelihood} × ${f.impactScore}${f.template ? ' · from the reference library' : ''}`
            : f.template
              ? 'from the reference library · not rated yet'
              : 'not rated yet'
        }</span>`
      }
    </td>
    <td>${sevChip(f.severity)}</td>
    <td>${statusChip(f)}</td>
    <td class="dev-acts"><span class="dev-acts-inner">
      <button type="button" class="btn btn-icon" data-pf-edit="${f.id}" title="Open"
        aria-label="Edit ${h(f.title)}">${icon.edit(13)}</button>
      ${
        canManageCatalog()
          ? `<button type="button" class="btn btn-icon btn-icon-danger" data-pf-del="${f.id}"
               title="Delete" aria-label="Delete ${h(f.title)}">${icon.trash(13)}</button>`
          : ''
      }
    </span></td>
  </tr>`;
}


export function bindProjectFindings(el, project, items, reload) {
  const rows = items || [];
  el.querySelectorAll('[data-pf-new]').forEach((b) =>
    b.addEventListener('click', () => openFindingForm(project, null, reload))
  );
  el.querySelectorAll('[data-pf-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const row = rows.find((f) => f.id === Number(b.dataset.pfEdit));
      if (row) openFindingForm(project, row, reload);
    })
  );
  el.querySelectorAll('[data-pf-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = rows.find((f) => f.id === Number(b.dataset.pfDel));
      if (!row) return;
      const ok = await confirmDialog({
        title: 'Delete finding?',
        message: `"${row.title}" will be removed from this project. This cannot be undone.`,
        confirmLabel: 'Delete finding',
      });
      if (!ok) return;
      try {
        await api.deleteFinding(row.id);
        toast('Finding deleted');
        await reload();
      } catch (err) {
        toast(err.message, 'err');
      }
    })
  );
}


/**
 * One form for a new and an existing finding: the fields are the same, and two
 * forms would drift the moment one of them gains a field.
 */
async function openFindingForm(project, row, reload) {
  const editing = Boolean(row);
  const f = row || {
    title: '',
    template: '',
    description: '',
    impact: '',
    mitigation: '',
  };
  const [lib, matrix] = await Promise.all([library(), risk()]);
  if (!matrix) {
    // Guessing a band here would be exactly the habit this change removes.
    toast('The risk matrix could not be loaded, so this finding cannot be rated', 'err');
    return;
  }
  // A row filed before the matrix existed carries 0/0; it opens at the diagonal
  // cell of the band it was given, which is the closest thing to its old severity.
  const start = f.likelihood && f.impactScore
    ? { likelihood: f.likelihood, impactScore: f.impactScore }
    : ratingsFor(matrix, f.severity);

  const { close } = openModal({
    title: editing ? 'Edit finding' : 'New finding',
    subtitle: project.name,
    wide: true,
    body: `
      ${
        // A search box, not a select: twenty entries in a long dropdown is a
        // scroll, and the thing a tester knows at that moment is a word — "idor",
        // "jwt", "upload" — not which band it sits in.
        lib.length
          ? `<div class="field">
               <label for="pf-template-q">Start from the library</label>
               <input class="input" id="pf-template-q" data-pf-template-q autocomplete="off"
                 spellcheck="false" placeholder="Search by title, area or severity"
                 value="${h(pickedTitle(f, lib))}">
               <div class="pf-lib" data-pf-lib hidden>
                 <div class="pf-lib-list" data-pf-lib-list role="listbox" aria-label="Library findings"></div>
               </div>
               <button type="button" class="link-btn" data-pf-template-clear hidden>Don't cite a library entry</button>
               <span class="hint">Copies the text once. Editing it here never edits the library.</span>
             </div>`
          : ''
      }
      <div class="field">
        <label for="pf-title">Title <span class="required">*</span></label>
        <input class="input" id="pf-title" data-pf-field="title" maxlength="300" value="${h(f.title)}"
          placeholder="What can be done that should not be">
      </div>
      <div class="form-row">
        <div class="field">
          <label for="pf-likelihood">Likelihood</label>
          <select class="input" id="pf-likelihood" data-pf-field="likelihood">
            ${matrix.likelihood
              .map(
                (l) =>
                  `<option value="${l.value}" ${l.value === start.likelihood ? 'selected' : ''}>${l.value} · ${h(l.label)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field">
          <label for="pf-impact-score">Impact</label>
          <select class="input" id="pf-impact-score" data-pf-field="impactScore">
            ${matrix.impact
              .map(
                (i) =>
                  `<option value="${i.value}" ${i.value === start.impactScore ? 'selected' : ''}>${i.value} · ${h(i.label)}</option>`
              )
              .join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <span class="hint" data-pf-risk></span>
      </div>
      ${
        // A finding is filed open, always. The status only appears once it is on
        // the table, where "Fixed" means something someone decided.
        editing
          ? `<div class="field">
        <label for="pf-status">Status</label>
        <select class="input" id="pf-status" data-pf-field="status">
          ${STATUSES.map((s) => `<option ${s === f.status ? 'selected' : ''}>${h(s)}</option>`).join('')}
        </select>
      </div>`
          : ''
      }
      <div class="field">
        <label for="pf-description">Description</label>
        <textarea class="input" id="pf-description" rows="3" data-pf-field="description"
          placeholder="What was observed, and where">${h(f.description)}</textarea>
      </div>
      <div class="field">
        <label for="pf-impact">Impact detail</label>
        <textarea class="input" id="pf-impact" rows="2" data-pf-field="impact"
          placeholder="What it lets an attacker do, in the client's terms">${h(f.impact)}</textarea>
      </div>
      <div class="field">
        <label for="pf-mitigation">Mitigation</label>
        <textarea class="input" id="pf-mitigation" rows="3" data-pf-field="mitigation"
          placeholder="What to change — one line per action">${h(f.mitigation)}</textarea>
      </div>`,
    footer: `<div class="spacer"></div>
      <button type="button" class="btn" data-pf-cancel>Cancel</button>
      <button type="button" class="btn btn-primary" data-pf-save>${editing ? 'Save' : 'Add finding'}</button>`,
    initialFocus: '[data-pf-field="title"]',
    onMount: (modal, closeFn) => {
      const field = (name) => modal.querySelector(`[data-pf-field="${name}"]`);
      const search = modal.querySelector('[data-pf-template-q]');
      const list = modal.querySelector('[data-pf-lib]');
      const options = modal.querySelector('[data-pf-lib-list]');
      const readout = modal.querySelector('[data-pf-risk]');
      // The entry this finding cites. Empty means "written here, from nothing".
      let picked = f.template && lib.some((l) => l.id === f.template) ? f.template : '';

      // The band the two selects currently land in, spelled out with the score so
      // it can be argued with before the row is saved.
      const paintRisk = () => {
        const likelihood = Number(field('likelihood').value);
        const impactScore = Number(field('impactScore').value);
        const severity = severityFor(matrix, likelihood, impactScore);
        readout.innerHTML = `${sevChip(severity)} <span class="hint">Likelihood ${likelihood} × Impact ${impactScore} = ${likelihood * impactScore}</span>`;
      };
      paintRisk();
      field('likelihood').addEventListener('change', paintRisk);
      field('impactScore').addEventListener('change', paintRisk);

      /** What the box is offering: title, area, severity and CWE, first 8. */
      const matches = (text) => {
        const q = text.trim().toLowerCase();
        const rows = q
          ? lib.filter((l) => `${l.title} ${l.area} ${l.severity} ${l.cwe}`.toLowerCase().includes(q))
          : lib;
        return rows.slice(0, LIB_LIMIT);
      };

      // Copying from the library fills the text once. After that the two are
      // separate: the library may change, and what we told this client must not.
      const pick = (id) => {
        const found = lib.find((l) => l.id === id);
        if (!found) return;
        picked = found.id;
        search.value = found.title;
        field('title').value = found.title;
        field('description').value = found.description;
        field('impact').value = found.impact;
        field('mitigation').value = (found.mitigation || []).join('\n');
        // The library says how bad it usually is; the rating is still ours, so
        // this only moves the selects into that band as a starting point.
        const suggested = ratingsFor(matrix, found.severity);
        field('likelihood').value = String(suggested.likelihood);
        field('impactScore').value = String(suggested.impactScore);
        paintRisk();
        paintPicked();
        hideList();
      };

      const clearBtn = modal.querySelector('[data-pf-template-clear]');
      const paintPicked = () => {
        if (clearBtn) clearBtn.hidden = !picked;
      };
      paintPicked();

      const hideList = () => {
        if (list) list.hidden = true;
        search?.setAttribute('aria-expanded', 'false');
      };

      /**
       * The query, with one wrinkle: the box holds the picked title, and focusing
       * it again should offer the whole library rather than "nothing matches this
       * exact sentence".
       */
      const query = () => (picked && search.value === pickedTitle({ template: picked }, lib) ? '' : search.value);

      const paintList = () => {
        const rows = matches(query());
        options.innerHTML = rows.length
          ? rows.map(libOptionHTML).join('')
          : '<div class="lib-none">Nothing in the library matches that. Write it yourself below.</div>';
        list.hidden = false;
        search.setAttribute('aria-expanded', 'true');
        // mousedown, not click: the field would blur and hide the list first.
        options.querySelectorAll('[data-pf-lib-opt]').forEach((btn) =>
          btn.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            pick(btn.dataset.pfLibOpt);
          })
        );
        const first = options.querySelector('[data-pf-lib-opt]');
        if (first) activeIndex = 0;
        paintActive();
      };

      // Enter picks the highlighted row, so "type three letters, press Enter" works.
      let activeIndex = -1;
      const paintActive = () => {
        const rows = [...options.querySelectorAll('[data-pf-lib-opt]')];
        rows.forEach((row, i) => row.classList.toggle('is-active', i === activeIndex));
        rows[activeIndex]?.scrollIntoView({ block: 'nearest' });
      };

      if (search) {
        search.setAttribute('role', 'combobox');
        search.setAttribute('aria-expanded', 'false');
        search.addEventListener('focus', paintList);
        search.addEventListener('input', () => {
          // Searching is not a decision. The citation is only dropped by picking
          // another entry or by the explicit link below — a keystroke must not
          // quietly un-cite a finding someone already filed.
          activeIndex = -1;
          paintList();
        });
        search.addEventListener('keydown', (ev) => {
          const rows = [...options.querySelectorAll('[data-pf-lib-opt]')];
          if (ev.key === 'Escape') {
            hideList();
            return;
          }
          if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            if (list.hidden) paintList();
            const step = ev.key === 'ArrowDown' ? 1 : -1;
            activeIndex = Math.max(0, Math.min(rows.length - 1, activeIndex + step));
            paintActive();
            ev.preventDefault();
            return;
          }
          if (ev.key === 'Enter' && rows.length) {
            ev.preventDefault();
            pick(rows[Math.max(0, activeIndex)].dataset.pfLibOpt);
          }
        });
        search.addEventListener('blur', () => setTimeout(hideList, 120));

        // Drops the citation and nothing else: the text already copied into the
        // fields is this project's finding now, and it stays.
        clearBtn?.addEventListener('click', () => {
          picked = '';
          search.value = '';
          paintPicked();
          hideList();
          search.focus();
        });
      }

      modal.querySelector('[data-pf-cancel]').addEventListener('click', closeFn);
      modal.querySelector('[data-pf-save]').addEventListener('click', async () => {
        const payload = {
          title: field('title').value.trim(),
          // Sent as numbers; the server derives severity from them and ignores any
          // severity a caller tries to hand it.
          likelihood: Number(field('likelihood').value),
          impactScore: Number(field('impactScore').value),
          template: picked,
          description: field('description').value.trim(),
          impact: field('impact').value.trim(),
          mitigation: field('mitigation').value.trim(),
        };
        // New findings are Open by definition; the server sets it, so there is no
        // field to keep in step here.
        if (editing) payload.status = field('status').value;
        if (!payload.title) {
          field('title').focus();
          toast('A finding needs a title', 'err');
          return;
        }
        const save = modal.querySelector('[data-pf-save]');
        save.disabled = true;
        try {
          if (editing) await api.updateFinding(f.id, payload);
          else await api.createFinding(project.id, payload);
          closeFn();
          toast(editing ? 'Finding saved' : 'Finding added');
          await reload();
        } catch (err) {
          save.disabled = false;
          toast(err.message, 'err');
        }
      });
    },
  });

  void close;
}
