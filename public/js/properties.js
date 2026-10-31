import { mountContent } from './projects.js';
import { bindSidebar, sidebarHTML } from './shell.js';
import { state } from './state.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { propList, setProperties } from './props.js';
import { confirmDialog, escapeHtml as h, openModal, toast } from './ui.js';


/* ============================================================
   Project properties (Admin panel → Properties)
   ------------------------------------------------------------
   The categories and statuses a project can carry, as data instead of
   two hard-coded arrays. A project stores the property's KEY; the label
   and the badge colour are edited here and applied everywhere at once.

   The seeded rows are `locked` — "Done" ends an engagement, "Mobile" owns
   the platform field, and SQL compares against those keys — so they can be
   renamed, recoloured and reordered but never deleted. Rows an admin adds
   are ordinary and disappear once nothing uses them.
   ============================================================ */
export const PROPERTY_TONES = ['slate', 'blue', 'cyan', 'violet', 'amber', 'green', 'rose'];


export function propertiesHTML() {
  return `<div class="admin">
    <div class="admin-head">
      <p>
        The categories and statuses a project can carry. Renaming one here renames it
        everywhere; the projects keep their place, because a project stores the key
        and this page edits the label.
      </p>
    </div>
    ${propertySectionHTML('category', 'Categories', 'What kind of target the engagement covers. “Mobile” also owns the platform field.')}
    ${propertySectionHTML('status', 'Statuses', 'Where an engagement stands. “Done” is what makes a project finished; it cannot be deleted.')}
  </div>`;
}


export function propertySectionHTML(kind, title, note) {
  const rows = propList(kind);
  return `<section class="admin-sec">
    <div class="admin-sec-head">
      <h3>${h(title)}</h3>
      <span class="admin-count">${rows.length}</span>
      <p>${h(note)}</p>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-prop-add="${kind}">${icon.plus(13)} ${kind === 'status' ? 'Status' : 'Category'}</button>
    </div>
    ${
      rows.length
        ? `<div class="dev-tablewrap">
             <table class="dev-table prop-table">
               <thead><tr>
                 <th class="dev-h-label"><span class="dev-h-inner"><span class="dev-h-label">Label</span></span></th>
                 <th class="dev-h-key"><span class="dev-h-inner"><span class="dev-h-label">Stored key</span></span></th>
                 <th class="dev-h-badge"><span class="dev-h-inner"><span class="dev-h-label">Looks like</span></span></th>
                 <th class="dev-h-acts"><span class="sr-only">Actions</span></th>
               </tr></thead>
               <tbody>${rows.map((p, i) => propertyRowHTML(kind, p, i, rows.length)).join('')}</tbody>
             </table>
           </div>`
        : `<div class="empty">
             <div class="icon">${icon.tag(24)}</div>
             <h3>No ${h(title.toLowerCase())} yet</h3>
             <p>Add one, and it shows up in the project form and the filter bar immediately.</p>
           </div>`
    }
  </section>`;
}


export function propertyRowHTML(kind, p, index, total) {
  return `<tr data-prop-row="${p.id}">
    <td class="dev-name">${h(p.label)}${
      p.locked ? '<span class="prop-lock" title="Built into the workflow — renaming and recolouring are fine, deleting is not">built in</span>' : ''
    }</td>
    <td class="dev-mono-cell">${h(p.key)}</td>
    <td><span class="badge" data-tone="${h(p.tone)}"><span class="dot"></span>${h(p.label)}</span></td>
    <td class="dev-acts"><span class="dev-acts-inner">
      <button type="button" class="btn btn-icon" data-prop-up="${p.id}" data-kind="${kind}"
        title="Move up" aria-label="Move ${h(p.label)} up" ${index === 0 ? 'disabled' : ''}>${icon.arrowUp(13)}</button>
      <button type="button" class="btn btn-icon" data-prop-down="${p.id}" data-kind="${kind}"
        title="Move down" aria-label="Move ${h(p.label)} down" ${index === total - 1 ? 'disabled' : ''}>${icon.arrowDown(13)}</button>
      <button type="button" class="btn btn-icon" data-prop-edit="${p.id}" data-kind="${kind}"
        title="Edit" aria-label="Edit ${h(p.label)}">${icon.edit(13)}</button>
      <button type="button" class="btn btn-icon btn-icon-danger" data-prop-del="${p.id}" data-kind="${kind}"
        title="${p.locked ? 'Built into the workflow — rename it instead' : 'Delete'}"
        aria-label="Delete ${h(p.label)}" ${p.locked ? 'disabled' : ''}>${icon.trash(13)}</button>
    </span></td>
  </tr>`;
}


export function bindProperties() {
  document.querySelectorAll('[data-prop-add]').forEach((b) =>
    b.addEventListener('click', () => openPropertyForm(b.dataset.propAdd, null))
  );
  document.querySelectorAll('[data-prop-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openPropertyForm(b.dataset.kind, propertyById(b.dataset.kind, b.dataset.propEdit))
    )
  );
  document.querySelectorAll('[data-prop-del]').forEach((b) =>
    b.addEventListener('click', () =>
      deleteProperty(b.dataset.kind, propertyById(b.dataset.kind, b.dataset.propDel))
    )
  );
  document.querySelectorAll('[data-prop-up]').forEach((b) =>
    b.addEventListener('click', () => moveProperty(b.dataset.kind, b.dataset.propUp, -1))
  );
  document.querySelectorAll('[data-prop-down]').forEach((b) =>
    b.addEventListener('click', () => moveProperty(b.dataset.kind, b.dataset.propDown, 1))
  );
}


export function propertyById(kind, id) {
  return propList(kind).find((p) => Number(p.id) === Number(id)) || null;
}


/**
 * Create or edit one property.
 *
 * The badge swatches are the choice itself — picking a tone from a list of colour
 * names and then squinting at the row behind the dialog is not a preview.
 */
export function openPropertyForm(kind, property = null) {
  const editing = Boolean(property);
  const noun = kind === 'status' ? 'status' : 'category';
  const tone = property?.tone || 'slate';

  openModal({
    title: editing ? `Edit ${noun}` : `New ${noun}`,
    subtitle: editing
      ? 'The stored key never changes — only the word people read and its colour.'
      : 'It appears in the project form, the filters and every badge.',
    body: `
      <div class="field">
        <label class="label" for="prop-label">Name</label>
        <input class="input" id="prop-label" value="${h(property?.label || '')}"
          placeholder="${kind === 'status' ? 'e.g. In progress' : 'e.g. Cloud'}" />
        ${editing ? `<span class="form-hint">Stored as <code>${h(property.key)}</code> — projects keep that value, so nothing moves.</span>` : ''}
      </div>
      <div class="field">
        <label class="label">Badge colour</label>
        <div class="prop-tones" id="prop-tones">
          ${PROPERTY_TONES.map(
            (t) => `<button type="button" class="prop-tone ${t === tone ? 'on' : ''}" data-tone="${t}"
              data-tone-value="${t}" aria-label="${t}" aria-pressed="${t === tone}">
              <span class="badge" data-tone="${t}"><span class="dot"></span>${h(property?.label || 'Preview')}</span>
            </button>`
          ).join('')}
        </div>
      </div>`,
    footer: `<span class="spacer"></span>
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : `Add ${noun}`}</button>`,
    onMount: (modal, close) => {
      let chosen = tone;
      const label = modal.querySelector('#prop-label');

      const repaintPreview = () => {
        const text = label.value.trim() || (editing ? property.label : 'Preview');
        modal.querySelectorAll('.prop-tone').forEach((btn) => {
          btn.classList.toggle('on', btn.dataset.toneValue === chosen);
          btn.setAttribute('aria-pressed', btn.dataset.toneValue === chosen ? 'true' : 'false');
          btn.querySelector('.badge').textContent = '';
          btn.querySelector('.badge').innerHTML = `<span class="dot"></span>${h(text)}`;
        });
      };
      modal.querySelectorAll('.prop-tone').forEach((btn) =>
        btn.addEventListener('click', () => {
          chosen = btn.dataset.toneValue;
          repaintPreview();
        })
      );
      label.addEventListener('input', repaintPreview);

      modal.querySelector('[data-cancel]').addEventListener('click', close);
      modal.querySelector('[data-save]').addEventListener('click', async () => {
        const value = label.value.trim();
        if (!value) {
          toast('A name is required', 'err');
          label.focus();
          return;
        }
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          const payload = { label: value, tone: chosen };
          const res = editing
            ? await api.updateProperty(kind, property.id, payload)
            : await api.createProperty(kind, payload);
          afterPropertiesChanged(res);
          toast(editing ? `${value} updated` : `${value} added`);
          close();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    },
  });
}


export async function deleteProperty(kind, property) {
  if (!property) return;
  const ok = await confirmDialog({
    title: `Delete “${property.label}”?`,
    message: `Any project still carrying it will block the delete — the server refuses rather than leaving rows nobody can render.`,
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  try {
    const res = await api.deleteProperty(kind, property.id);
    afterPropertiesChanged(res);
    toast(`${property.label} deleted`);
  } catch (err) {
    toast(err.message, 'err');
  }
}


/** Reorder by one slot: swap with the neighbour and persist the whole order. */
export async function moveProperty(kind, id, delta) {
  const list = propList(kind).slice();
  const at = list.findIndex((p) => Number(p.id) === Number(id));
  const to = at + delta;
  if (at < 0 || to < 0 || to >= list.length) return;
  const [moved] = list.splice(at, 1);
  list.splice(to, 0, moved);
  try {
    const res = await api.reorderProperties(
      kind,
      list.map((p) => p.id)
    );
    afterPropertiesChanged(res);
  } catch (err) {
    toast(err.message, 'err');
  }
}


/**
 * Adopt a writer's response: it carries the whole fresh list, so the registry, the
 * sidebar badge and whichever page is open all move together.
 */
export function afterPropertiesChanged(payload) {
  setProperties(payload);
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.outerHTML = sidebarHTML();
  bindSidebar();
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.nav));
  mountContent();
}
