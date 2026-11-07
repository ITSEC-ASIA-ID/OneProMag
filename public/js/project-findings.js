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

   Severity and status reuse the library's vocabulary and the library's chips
   (`.lib-sev` + the same four tones) rather than growing a second colour code
   for the same four words.
   ============================================================ */

const SEVERITY_TONE = { Critical: 'rose', High: 'amber', Medium: 'blue', Low: 'slate' };
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
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
        // The library id would mean nothing to a reader; what matters is that
        // this started from our method rather than from nothing.
        f.template ? `<span class="ck-sub">from the reference library</span>` : ''
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
    severity: 'Medium',
    status: 'Open',
    template: '',
    description: '',
    impact: '',
    mitigation: '',
  };
  const lib = await library();

  const { close } = openModal({
    title: editing ? 'Edit finding' : 'New finding',
    subtitle: project.name,
    wide: true,
    body: `
      ${
        lib.length
          ? `<div class="field">
               <label for="pf-template">Start from the library</label>
               <select class="input" id="pf-template" data-pf-template>
                 <option value="">Write it myself</option>
                 ${lib
                   .map(
                     (l) =>
                       `<option value="${h(l.id)}" ${l.id === f.template ? 'selected' : ''}>${h(
                         `${l.severity} · ${l.title}`
                       )}</option>`
                   )
                   .join('')}
               </select>
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
          <label for="pf-severity">Severity</label>
          <select class="input" id="pf-severity" data-pf-field="severity">
            ${SEVERITIES.map((s) => `<option ${s === f.severity ? 'selected' : ''}>${h(s)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="pf-status">Status</label>
          <select class="input" id="pf-status" data-pf-field="status">
            ${STATUSES.map((s) => `<option ${s === f.status ? 'selected' : ''}>${h(s)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="pf-description">Description</label>
        <textarea class="input" id="pf-description" rows="3" data-pf-field="description"
          placeholder="What was observed, and where">${h(f.description)}</textarea>
      </div>
      <div class="field">
        <label for="pf-impact">Impact</label>
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
      const template = modal.querySelector('[data-pf-template]');

      // Copying from the library fills the text once. After that the two are
      // separate: the library may change, and what we told this client must not.
      template?.addEventListener('change', () => {
        const found = lib.find((l) => l.id === template.value);
        if (!found) return;
        field('title').value = found.title;
        field('severity').value = found.severity;
        field('description').value = found.description;
        field('impact').value = found.impact;
        field('mitigation').value = (found.mitigation || []).join('\n');
      });

      modal.querySelector('[data-pf-cancel]').addEventListener('click', closeFn);
      modal.querySelector('[data-pf-save]').addEventListener('click', async () => {
        const payload = {
          title: field('title').value.trim(),
          severity: field('severity').value,
          status: field('status').value,
          template: template ? template.value : f.template,
          description: field('description').value.trim(),
          impact: field('impact').value.trim(),
          mitigation: field('mitigation').value.trim(),
        };
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
