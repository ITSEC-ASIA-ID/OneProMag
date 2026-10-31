import { impHead } from './admin.js';
import { mountContent } from './projects.js';
import { isCurrentLoad, nextLoadToken } from './shared.js';
import { loadStats } from './shell.js';
import { canManageCatalog, state } from './state.js';
import { splitImportLine } from './users.js';
import { api } from './api.js';
import { DEVICE_KIND, icon } from './icons.js';
import {
  bindSegmented, confirmDialog, escapeHtml as h, openModal,
  segmented, segmentedValue, toast,
} from './ui.js';


/** The picker list: every client, then that client's applications beneath it. */
/* ============================================================
   Devices — the hardware inventory
   ============================================================ */

/**
 * Which field of a device reads best as its subtitle in the compact views.
 * A name alone is not enough to tell two units of the same model apart, so the
 * unique-ish identifiers get precedence over prose.
 */
export function deviceIdentifier(d) {
  for (const key of ['serial', 'uuid', 'version', 'rom', 'edcType']) {
    const v = d[key];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}


export function deviceTabsHTML() {
  // Counts come from the server so a filter or a selected tab cannot zero out the
  // other three tabs.
  const counts = state.deviceCounts || {};
  return `<div class="segmented dev-tabs" role="tablist" aria-label="Device type">
    ${state.deviceKinds
      .map((k) => {
        const def = DEVICE_KIND[k] || { tone: 'slate', icon: 'layers', label: k };
        const on = state.deviceKind === k;
        return `<button type="button" class="seg dev-tab ${on ? 'on' : ''}" role="tab"
          aria-selected="${on}" data-device-kind="${k}">
          ${icon[def.icon] ? icon[def.icon](14) : ''}<span>${h(def.label)}</span>
          <em class="dev-count">${counts[k] || 0}</em>
        </button>`;
      })
      .join('')}
  </div>`;
}


/**
 * The device table.
 *
 * Columns come from the KIND's field list (`state.deviceFields`), not from a
 * fixed template — that is what lets an EDC sheet show nine columns while Misc
 * shows three, from one renderer. Notes gets a narrower column and wraps, since
 * it is the only field that holds sentences.
 */
/** The visible columns for the current kind, in configured order. */
export function deviceColumns() {
  const cols = state.deviceColumns?.[state.deviceKind];
  if (Array.isArray(cols) && cols.length) return cols.filter((c) => !c.hidden);
  // Fall back to the prescribed fields if the config has not loaded yet, so the
  // table is never blank on a slow first paint.
  return (state.deviceFields[state.deviceKind] || []).map((key) => ({
    key,
    label: state.deviceLabels[key] || key,
    builtin: true,
  }));
}


/** One cell's value, whether the column is a real field or a user-added one. */
export function deviceCellValue(d, col) {
  if (col.builtin) return d[col.key] ?? '';
  const v = d.extra?.[col.key];
  return v === undefined || v === null ? '' : String(v);
}


export function devicesTableHTML(rows) {
  const cols = deviceColumns();
  const editing = !!state.deviceEdit;
  // Rows in the grid = stored rows + rows added but not yet saved. The pending
  // ones carry a negative id so every per-cell selector keeps working unchanged.
  const pending = editing ? state.deviceEdit.pending || [] : [];
  const gridRows = editing ? [...rows, ...pending.map((r) => ({ id: r.tmp, __pending: true }))] : rows;
  if (!rows.length) {
    const q = state.deviceQuery.trim();
    return `<div class="empty">
      <div class="icon">${icon.phone(26)}</div>
      <h3>${q ? `No devices match “${h(q)}”` : `No ${h(DEVICE_KIND[state.deviceKind]?.label || state.deviceKind)} devices yet`}</h3>
      <p>${q ? `It looks in every column of the ${h(DEVICE_KIND[state.deviceKind]?.label || state.deviceKind)} tab — try another type, or search from All.` : 'Add the first one so the team knows what kit is available.'}</p>
      ${q ? '' : `<button class="btn btn-primary" data-device-new>${icon.plus()} Add device</button>`}
    </div>`;
  }
  return `<div class="dev-tablewrap${editing ? ' is-bulk' : ''}" data-dev-scroll>
      <span class="dev-scrollfx left" aria-hidden="true"></span>
      <span class="dev-scrollfx right" aria-hidden="true"></span>
    <table class="dev-table">
      <thead><tr>
        ${editing ? '<th class="dev-h-grip"><span class="sr-only">Reorder</span></th>' : ''}
        ${cols
          .map(
            (c, ci) => `<th class="dev-h-${h(c.key)}" data-dev-colhead="${ci}" data-col-key="${h(c.key)}"
              draggable="${editing ? 'true' : 'false'}"${
                editing ? ` title="${h(c.label)} — drag to move this column"` : ''
              }>
              <span class="dev-h-inner">
                ${editing ? `<span class="dev-col-grip" aria-hidden="true">${icon.gripX(11)}</span>` : ''}
                <span class="dev-h-label">${h(c.label)}</span>
              </span>
            </th>`
          )
          .join('')}
        ${editing ? '<th class="dev-h-acts"><span class="sr-only">Actions</span></th>' : ''}
      </tr></thead>
      <tbody>${gridRows
        .map(
          (d, ri) => `<tr data-dev-row="${d.id}" data-ri="${ri}"${editing ? ' class="is-editing"' : ''}${d.__pending ? ' data-pending="1"' : ''}>
          ${
            editing
              ? `<td class="dev-grip"${d.__pending ? '' : ' draggable="true"'}
            title="${d.__pending ? 'Save this row before reordering it' : 'Drag to reorder'}"><span class="dev-grip-dots${d.__pending ? ' is-off' : ''}">${icon.grip(12)}</span></td>`
              : ''
          }
          ${cols
            .map((c) => {
              if (editing) {
                // Every visible cell becomes an input, so the whole sheet can be
                // corrected without opening a dialog per row. The column label is
                // repeated as the accessible name: the header is far above on a
                // wide sheet, so "input" alone would be unidentifiable.
                const v = d.__pending ? state.deviceEdit.draft[d.id]?.[c.key] ?? '' : bulkCellValue(d.id, c);
                // The label span is hidden on desktop (the header already names the
                // column) and shown when the row stacks into a card on a phone, where
                // the header is off-screen and each field needs its own name.
                const common = `class="input dev-cell-input" data-bulk-cell="${d.id}" data-bulk-col="${h(c.key)}"
                  aria-label="${h(d.name)} — ${h(c.label)}" placeholder="${h(c.label)}"`;
                // A free-text column gets a textarea: a single-line input can only show
                // the first ~40 characters of a note, and hiding the rest behind a
                // sideways scroll inside a one-line box makes it unreadable. Derived
                // from the column and the value rather than a per-column flag, so a
                // user-added column with long text is treated the same way.
                const longText = c.key === 'notes' || String(v).length > 40;
                const field = longText
                  ? `<textarea ${common} rows="${Math.min(6, Math.max(2, Math.ceil(String(v).length / 46)))}">${h(v)}</textarea>`
                  : `<input ${common} type="text" value="${h(v)}" autocomplete="off" />`;
                return `<td class="dev-edit-cell" data-label="${h(c.label)}">
                  <span class="de-label" aria-hidden="true">${h(c.label)}</span>${field}</td>`;
              }
              const v = deviceCellValue(d, c);
              if (!String(v).trim()) return `<td class="dev-empty-cell">—</td>`;
              if (c.key === 'name') return `<td class="dev-name">${h(v)}</td>`;
              if (c.key === 'notes') return `<td class="dev-notes" title="${h(v)}">${h(v)}</td>`;
              return `<td class="dev-mono-cell">${h(v)}</td>`;
            })
            .join('')}
          ${editing ? `<td class="dev-acts" data-label="Row actions"><span class="dev-acts-inner">
            ${d.__pending
              ? `<span class="dev-new-chip" title="This row is not saved yet">New</span>
                <button class="btn btn-icon btn-icon-danger" data-pending-drop="${d.id}"
                  aria-label="Remove this unsaved row" title="Remove this unsaved row">${icon.x(13)}</button>`
              : `<button class="btn btn-icon" data-device-edit="${d.id}"
                  aria-label="Edit ${h(d.name || 'device')}" title="Edit">${icon.edit(13)}</button>
                ${
                  canManageCatalog()
                    ? `<button class="btn btn-icon btn-icon-danger" data-device-del="${d.id}"
                        aria-label="Delete this row" title="Delete this row">${icon.trash(13)}</button>`
                    : ''
                }`}
          </span></td>` : ''}
        </tr>`
        )
        .join('')}
        ${
          editing
            ? `<tr class="dev-addrow"><td class="dev-grip dev-addrow-grip"></td>
          <td class="dev-addrow-cell" colspan="${cols.length + 1}">
            <button type="button" class="dev-addrow-btn is-add" data-bulk-addrow>${icon.plus(13)} Add a row</button>
          </td>
        </tr>`
            : ''
        }</tbody>
    </table>
  </div>
  <p class="dev-scrollhint">${icon.chevronRight(12)} Scroll sideways for the remaining columns</p>`;
}


/**
 * Current text for one cell in bulk-edit mode.
 *
 * Reads the draft, falling back to the saved value so a column the user has not
 * touched still shows what is stored — the draft is a diff, not a replacement.
 */
export function bulkCellValue(deviceId, col) {
  const draft = state.deviceEdit?.draft?.[deviceId];
  if (draft && Object.prototype.hasOwnProperty.call(draft, col.key)) return draft[col.key];
  // A row added in the grid has no stored record yet, so its only value is what
  // is in the draft; falling through to the saved list would return ''.
  const pend = state.deviceEdit?.pending?.find((r) => r.tmp === Number(deviceId));
  if (pend) return pend.values[col.key] ?? '';
  const d = state.devices.find((x) => Number(x.id) === Number(deviceId));
  return d ? deviceCellValue(d, col) : '';
}


/** A row that exists only in the grid so far. Ids are negative and never persisted. */
export function isPendingRow(deviceId) {
  return Number(deviceId) < 0;
}


/**
 * Enter grid edit for the rows currently on screen.
 *
 * Only visible rows are edited: starting from what the user can see means Save
 * never silently rewrites something that was filtered out of view.
 */
export function startBulkEdit() {
  const rows = state.devices || [];
  if (!rows.length) return;
  state.deviceEdit = { ids: rows.map((d) => d.id), draft: {}, pending: [], nextTmp: -1 };
  mountContent();
  // Put the caret in the first cell: the whole point is to start typing, and
  // making the user hunt for the first input wastes the gesture.
  const first = document.querySelector('.dev-cell-input');
  first?.focus();
  first?.select?.();
}


/**
 * Add an empty row to the grid.
 *
 * The row is created on Save, not now: writing a blank device to the database the
 * moment someone clicks "+" would leave junk rows behind if they change their
 * mind, and the grid is supposed to be a draft until Save.
 */
export function addPendingRow() {
  if (!state.deviceEdit) return;
  const tmp = state.deviceEdit.nextTmp ?? -1;
  state.deviceEdit.nextTmp = tmp - 1;
  state.deviceEdit.pending = [...(state.deviceEdit.pending || []), { tmp, values: {} }];
  repaintDeviceRows();
  const sel = `[data-bulk-cell="${tmp}"][data-bulk-col="name"]`;
  const input = document.querySelector(sel);
  input?.scrollIntoView({ block: 'center' });
  input?.focus();
  refreshBulkCounter();
}


export function removePendingRow(tmp) {
  if (!state.deviceEdit) return;
  state.deviceEdit.pending = (state.deviceEdit.pending || []).filter((r) => r.tmp !== Number(tmp));
  delete state.deviceEdit.draft[Number(tmp)];
  repaintDeviceRows();
  refreshBulkCounter();
}


export function cancelBulkEdit() {
  state.deviceEdit = null;
  mountContent();
}


/**
 * Keep the draft in step with what is typed, and save on Enter.
 *
 * The draft exists so a re-render mid-edit (a repaint after deleting a row, say)
 * does not silently throw away typed values. It records only fields the user
 * actually touched, which is also why the dirty counter reads the live inputs
 * instead.
 */
/**
 * Grow a note textarea to fit its content.
 *
 * A fixed `rows` count is a guess: the same 50 characters take two lines at
 * desktop width and three on a phone, so the box either clips the value or
 * leaves a hole. Measuring the scroll height is the only way to know.
 */
export function autosizeNote(el) {
  if (el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  // +2px absorbs the sub-pixel rounding that otherwise leaves a 1-2px scrollbar
  // and makes the last line look clipped.
  el.style.height = `${el.scrollHeight + 2}px`;
}


export function bindBulkCells() {
  if (!state.deviceEdit) return;
  const inputs = document.querySelectorAll('[data-bulk-cell]');
  inputs.forEach((input, i) => {
    autosizeNote(input);
    if (input.dataset.bound) return;
    input.dataset.bound = '1';
    const write = () => {
      const id = Number(input.dataset.bulkCell);
      const cells = (state.deviceEdit.draft[id] ||= {});
      cells[input.dataset.bulkCol] = input.value;
      refreshBulkCounter();
    };
    input.addEventListener('input', () => {
      autosizeNote(input);
      write();
    });
    // Enter is the fastest way through a column of corrections, so it saves the
    // whole batch rather than just committing one cell. Shift+Enter and Tab keep
    // their normal meaning for moving around the grid.
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        // In a note field Enter is a newline, not "save everything": a multi-line
        // note is written with the key, so saving on it would make the field
        // impossible to use.
        if (input.tagName === 'TEXTAREA') return;
        ev.preventDefault();
        document.querySelector('[data-bulk-save]')?.click();
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        document.querySelector('[data-bulk-cancel]')?.click();
      }
      // Tab past the last cell would leave the grid and lose the caret; wrap
      // instead so the user keeps circling the sheet.
      if (ev.key === 'Tab' && !ev.shiftKey && i === inputs.length - 1) {
        ev.preventDefault();
        inputs[0].focus();
        inputs[0].select();
      }
      if (ev.key === 'Tab' && ev.shiftKey && i === 0) {
        ev.preventDefault();
        inputs[inputs.length - 1].focus();
        inputs[inputs.length - 1].select();
      }
    });
  });
}


export async function saveBulkEdit(btn) {
  if (!state.deviceEdit) return;
  const rows = state.devices;
  const pending = state.deviceEdit.pending || [];
  // Send only what changed. A whole-sheet write would stamp updated_at on rows
  // nobody touched and could clobber a concurrent edit from another session.
  const updates = [];
  for (const d of rows) {
    const payload = { id: d.id };
    const extra = { ...(d.extra || {}) };
    let touched = false;
    for (const c of deviceColumns()) {
      const input = document.querySelector(`[data-bulk-cell="${d.id}"][data-bulk-col="${c.key}"]`);
      if (!input) continue;
      // Compare against the stored value with the RIGHT accessor: custom columns
      // live in `extra`, and reading them off the row directly always looked empty,
      // so every custom cell counted as edited on every save.
      const stored = c.builtin ? d[c.key] : d.extra?.[c.key];
      if (String(input.value) === String(stored ?? '')) continue;
      // Same split the single-row form uses: a custom key sent at the top level is
      // silently dropped by the server, which only persists known field names.
      if (c.builtin) payload[c.key] = input.value;
      else extra[c.key] = input.value;
      touched = true;
    }
    if (touched) {
      payload.extra = extra;
      updates.push(payload);
    }
  }
  // Rows added in the grid are inserts, not edits: they are collected separately
  // and written after the updates so a failure part-way cannot lose them silently.
  const creates = pending.map((r) => {
    const values = { kind: state.deviceKind, extra: {} };
    for (const c of deviceColumns()) {
      const input = document.querySelector(`[data-bulk-cell="${r.tmp}"][data-bulk-col="${c.key}"]`);
      const v = input ? input.value : r.values[c.key] || '';
      if (c.builtin) values[c.key] = v;
      else values.extra[c.key] = v;
    }
    return values;
  });
  if (!updates.length && !creates.length) {
    toast('Nothing changed', 'info');
    cancelBulkEdit();
    return;
  }
  // Blank names are the one thing the grid can produce that the API rejects, so
  // catch it here where the offending row can be pointed at.
  const blank = [...rows, ...pending.map((r) => ({ id: r.tmp }))].find((d) => {
    const input = document.querySelector(`[data-bulk-cell="${d.id}"][data-bulk-col="name"]`);
    return input && !input.value.trim();
  });
  if (blank) {
    toast('Every device needs a name — check the highlighted row', 'err');
    const input = document.querySelector(`input[data-bulk-cell="${blank.id}"][data-bulk-col="name"]`);
    input?.classList.add('is-bad');
    input?.focus();
    return;
  }
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Saving…';
  try {
    if (updates.length) await api.bulkUpdateDevices(updates);
    for (const payload of creates) await api.createDevice(payload);
    const total = updates.length + creates.length;
    toast(`Saved ${total} row${total === 1 ? '' : 's'}`, 'ok');
    state.deviceEdit = null;
    await loadDevices();
    await loadStats();
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false;
    btn.textContent = label;
  }
}


/** Card view for narrow screens: a table with nine columns cannot fit a phone. */
export function devicesCardsHTML(rows) {
  const cols = deviceColumns();
  const editing = !!state.deviceEdit;
  if (!rows.length) return devicesTableHTML(rows);
  return `<div class="dev-cards">${rows
    .map((d) => {
      const ident = deviceIdentifier(d);
      const notesCol = cols.find((c) => c.key === 'notes');
      const notes = notesCol ? deviceCellValue(d, notesCol) : '';
      return `<article class="dev-card">
        <header class="dc-head">
          <div>
            <h4>${h(d.name)}</h4>
            ${ident ? `<p class="dc-ident">${h(ident)}</p>` : ''}
          </div>
          <div class="dc-acts">
            ${editing ? `<button class="btn btn-icon" data-device-edit="${d.id}" aria-label="Edit ${h(d.name)}">${icon.edit(13)}</button>
            ${canManageCatalog() ? `<button class="btn btn-icon btn-icon-danger" data-device-del="${d.id}" aria-label="Delete ${h(d.name)}">${icon.trash(13)}</button>` : ''}` : ''}
          </div>
        </header>
        <dl class="dc-fields">
          ${cols
            .filter((c) => c.key !== 'name' && c.key !== 'notes')
            .map((c) => `<div class="dc-row"><dt>${h(c.label)}</dt><dd>${h(deviceCellValue(d, c) || '—')}</dd></div>`)
            .join('')}
        </dl>
        ${notes ? `<p class="dc-notes">${h(notes)}</p>` : ''}
      </article>`;
    })
    .join('')}</div>`;
}


export function devicesHTML() {
  const rows = state.devices || [];
  const def = DEVICE_KIND[state.deviceKind] || { label: state.deviceKind };
  const editing = !!state.deviceEdit;
  return `<div class="dev-head">
      <div>
        <h2>${h(def.label)} devices</h2>
        <p class="dev-sub">${rows.length} device${rows.length === 1 ? '' : 's'} in this type</p>
      </div>
      <div class="dev-head-actions">
        <button class="btn" data-device-import>${icon.upload(13)} Import</button>
        ${
          editing
            ? ''
            : rows.length
              ? `<button class="btn" data-device-bulk>${icon.edit(14)} Edit all rows</button>`
              : /* No rows means no edit mode to enter, so this is the only way to
                   create the first device — keep the CTA rather than dead-ending. */
                `<button class="btn btn-primary" data-device-new>${icon.plus()} Add device</button>`
        }
      </div>
    </div>
    ${editing ? bulkBarHTML(rows) : ''}
    <div class="dev-bar">
      ${deviceTabsHTML()}
      <div class="search dev-search">
        ${icon.search()}
        <input class="input" id="device-search" placeholder="Search any column…"
          autocomplete="off" aria-label="Search devices" value="${h(state.deviceQuery || '')}"
          ${editing ? 'disabled' : ''} />
        <button class="btn btn-sm dev-clear" data-device-clear ${state.deviceQuery ? '' : 'hidden'}>Clear</button>
      </div>
    </div>
    ${state.devicesLoading ? `<div class="dev-skel"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>` : ''}
    <div class="${state.devicesLoading ? 'is-hidden' : ''}">
      ${editing ? `<div class="dev-bulkhost">${devicesTableHTML(rows)}</div>` : `<div class="dev-desktop">${devicesTableHTML(rows)}</div>
      <div class="dev-mobile">${devicesCardsHTML(rows)}</div>`}
    </div>`;
}


/**
 * Save / discard strip shown above the sheet while every row is editable.
 *
 * It states the scope explicitly (`all N rows on this tab`) because the edit
 * covers what is on screen, not the whole database — a user who filtered or
 * paged the sheet should not assume Save reaches rows they cannot see.
 */
export function bulkBarHTML(rows) {
  const dirty = bulkDirtyCount();
  // "Add column" sits immediately LEFT of "Add device": both are "one more of a thing",
  // and grouping the two add-actions here keeps the trailing table row to the single
  // row-level action it is named after. The bar is where a user looks for a toolbar.
  // The keyboard hint is hidden on phones by CSS — a phone has no Tab key.
  return `<div class="dev-bulkbar">
    <span class="db-tag">${icon.edit(13)} Editing ${rows.length} row${rows.length === 1 ? '' : 's'}</span>
    <span class="db-note">Every cell is open. Tab moves across, Enter saves.</span>
    <span class="spacer"></span>
    <span class="db-dirty" data-bulk-dirty>${dirty ? `${dirty} changed` : 'No changes yet'}</span>
    <button class="btn" data-device-addcol>${icon.colPlus(13)} Add column</button>
    <button class="btn" data-device-new>${icon.plus(13)} Add device</button>
    <button class="btn" data-bulk-cancel>Discard</button>
    <button class="btn btn-primary" data-bulk-save>Save all${dirty ? ` (${dirty})` : ''}</button>
  </div>`;
}


/** How many cells differ from what is stored — drives the counter and Save label. */
/** Repaint the counter and the Save label from the current inputs. */
export function refreshBulkCounter() {
  const badge = document.querySelector('[data-bulk-dirty]');
  const save = document.querySelector('[data-bulk-save]');
  const n = bulkDirtyCount();
  if (badge) badge.textContent = n ? `${n} changed` : 'No changes yet';
  if (save) save.textContent = n ? `Save all (${n})` : 'Save all';
}


export function bulkDirtyCount() {
  if (!state.deviceEdit) return 0;
  let n = 0;
  // Count against the live inputs rather than the draft: the draft only records
  // fields the user typed in, so it cannot tell whether a value actually
  // changed — retyping the same text would look like an edit.
  for (const input of document.querySelectorAll('[data-bulk-cell]')) {
    const id = Number(input.dataset.bulkCell);
    const colConf = deviceColumns().find((c) => c.key === input.dataset.bulkCol);
    if (!colConf) continue;
    if (isPendingRow(id)) {
      // An added row counts once, when its first field is filled in — counting all
      // six blank cells would report "6 changed" for one new row the instant it
      // appeared, which reads as six accidental edits.
      if (String(input.value).trim()) n += 1;
      continue;
    }
    const row = state.devices.find((x) => Number(x.id) === id);
    if (!row) continue;
    if (String(input.value) !== String(deviceCellValue(row, colConf))) n += 1;
  }
  return n;
}


export async function loadDevices() {
  state.devicesLoading = !state.devices.length;
  if (state.devicesLoading) mountContent();
  const token = nextLoadToken('devices');
  try {
    const res = await api.devices({ kind: state.deviceKind, q: state.deviceQuery.trim() });
    if (!isCurrentLoad('devices', token)) return;
    state.devices = res.devices;
    state.deviceCounts = res.counts || {};
    state.deviceColumns = res.columns || {};
    state.deviceFields = res.fields;
    state.deviceLabels = res.labels;
    state.deviceKinds = res.kinds;
  } catch (err) {
    if (!isCurrentLoad('devices', token)) return;
    toast(err.message, 'err');
    state.devices = [];
  }
  state.devicesLoading = false;
  if (state.nav === 'devices') mountContent();
}


/**
 * Add / edit one device.
 *
 * The form is built from the kind's own field list, so switching the type
 * re-renders the fields in place. Values typed under the OLD type are kept in a
 * scratch object and restored if the user switches back — losing half a form to a
 * mis-click on the type control would be its own bug report.
 */
export function openDeviceForm(device = null) {
  const isEdit = !!device;
  let kind = device?.kind || state.deviceKind;
  // ONE value store for the whole form, keyed by field name. Fields shared by
  // several kinds (name, whoUsed, notes) therefore survive a type switch — a user
  // who mis-files a device and flips Android -> EDC should not have to retype the
  // name. Fields the new kind does not own simply stay in the store unused, and
  // are dropped before saving.
  const values = { ...(isEdit ? device : {}) };

  // Columns drive the form, not the prescribed field list: a user who added
  // "Firmware Build" must be able to fill it in, and a column they hid should
  // not keep asking for a value nothing displays.
  const formColumns = (k) => {
    const cols = state.deviceColumns?.[k];
    if (Array.isArray(cols) && cols.length) return cols.filter((c) => !c.hidden);
    const labels = state.deviceLabels || {};
    return (state.deviceFields[k] || []).map((f) => ({ key: f, label: labels[f] || f, builtin: true }));
  };
  const fieldListHTML = (k) => {
    const cols = formColumns(k);
    return cols
      .map((col) => {
        const f = col.key;
        const v = col.builtin ? values[f] ?? '' : values.extra?.[f] ?? '';
        const label = col.label || f;
        if (f === 'notes') {
          return `<div class="field dev-field-wide">
            <label for="d-notes">${h(label)}</label>
            <textarea class="textarea" id="d-notes" rows="3"
              placeholder="Anything worth remembering…">${h(v)}</textarea>
          </div>`;
        }
        return `<div class="field">
          <label for="d-${f}">${h(label)}${f === 'name' ? ' <em class="req">*</em>' : ''}</label>
          <input class="input" id="d-${f}" value="${h(v)}"
            placeholder="${h(f === 'name' ? 'e.g. Samsung Galaxy A54' : label)}" />
        </div>`;
      })
      .join('');
  };

  const bodyHTML = (k) => `<div class="field">
      <label>Type</label>
      <div class="segmented" data-segmented="devkind" role="group" aria-label="Device type">
        ${state.deviceKinds
          .map(
            (x) => `<button type="button" class="seg ${x === k ? 'on' : ''}" data-value="${h(x)}">${
              icon[DEVICE_KIND[x]?.icon] ? icon[DEVICE_KIND[x].icon](13) : ''
            } ${h(DEVICE_KIND[x]?.label || x)}</button>`
          )
          .join('')}
      </div>
      <span class="hint">Each type records its own fields — switching type swaps them.</span>
    </div>
    <div class="dev-fields" id="d-fields">${fieldListHTML(k)}</div>`;

  const { close, modal } = openModal({
    title: isEdit ? 'Edit device' : 'Add device',
    subtitle: isEdit ? device.name : 'Record one phone, terminal or piece of kit',
    wide: true,
    body: bodyHTML(kind),
    footer: `<button class="btn" data-cancel>Cancel</button>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-save>${isEdit ? 'Save changes' : 'Add device'}</button>`,
    onMount: (m) => {
      const seg = m.querySelector('[data-segmented="devkind"]');
      // bindSegmented(root, name, onChange): it looks the group up by name inside
      // root, so passing the group itself as root finds nothing.
      bindSegmented(m, 'devkind', () => {
        // Harvest what is on screen BEFORE swapping the field list, then reuse it
        // for the new kind so shared fields keep their text.
        for (const col of formColumns(kind)) {
          const el = m.querySelector(`#d-${col.key}`);
          if (!el) continue;
          if (col.builtin) values[col.key] = el.value;
          else values.extra = { ...(values.extra || {}), [col.key]: el.value };
        }
        kind = seg.querySelector('button.on')?.dataset.value || kind;
        m.querySelector('#d-fields').innerHTML = fieldListHTML(kind);
      });
      m.querySelector('#d-name')?.focus();
    },
  });

  modal.querySelector('[data-cancel]')?.addEventListener('click', close);
  modal.querySelector('[data-save]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const payload = { kind };
    const extra = {};
    for (const col of formColumns(kind)) {
      const el = modal.querySelector(`#d-${col.key}`);
      const v = el ? el.value : '';
      // Built-in columns are real DB columns; custom ones ride in the `extra`
      // blob. Sending a custom key at the top level would be silently dropped
      // by the server, which only persists known field names.
      if (col.builtin) payload[col.key] = v;
      else extra[col.key] = v;
    }
    payload.extra = extra;
    if (!String(payload.name || '').trim()) {
      toast('Device name is required', 'err');
      modal.querySelector('#d-name')?.focus();
      return;
    }
    btn.disabled = true;
    try {
      if (isEdit) await api.updateDevice(device.id, payload);
      else await api.createDevice(payload);
      // Follow the saved kind so the row is visible rather than orphaned in a
      // tab the user is not looking at.
      state.deviceKind = kind;
      localStorage.setItem('opm-device-kind', kind);
      state.deviceQuery = '';
      close();
      toast(isEdit ? 'Device updated' : 'Device added', 'ok');
      await loadDevices();
      await loadStats();
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });
}


/**
 * Column editor for the current kind — the equivalent of the Information
 * center's grid editor, scoped to what an inventory sheet actually needs:
 * rename, reorder, hide, add and delete, then save the whole arrangement.
 *
 * Edits are held in a local `draft` and only written when Save is pressed, so an
 * abandoned edit cannot half-apply a column change.
 */
export function openColumnEditor(options = {}) {
  const kind = state.deviceKind;
  const all = (state.deviceColumns?.[kind] || []).map((c) => ({ ...c }));
  const draft = all.map((c) => ({ ...c }));
  let seq = draft.length;

  const listHTML = () => `<ul class="dc-list">
    ${draft
      .map(
        (c, i) => `<li class="dc-item" data-key="${h(c.key)}">
        <span class="dc-item-grip" aria-hidden="true">${icon.grip(12)}</span>
        <input class="input dc-label" value="${h(c.label)}" aria-label="Column name" maxlength="60" />
        <span class="dc-item-key">${c.builtin ? 'field' : 'custom'}</span>
        <label class="dc-hide" title="Hide this column">
          <input type="checkbox" data-hide ${c.hidden ? 'checked' : ''} />
          <span>hidden</span>
        </label>
        <span class="dc-item-move">
          <button type="button" class="te-mini" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move left">${icon.chevronLeft(15)}</button>
          <button type="button" class="te-mini" data-move="1" ${i === draft.length - 1 ? 'disabled' : ''} aria-label="Move right">${icon.chevronRight(15)}</button>
        </span>
        <button type="button" class="te-mini te-mini-danger" data-del aria-label="Delete column"
          ${draft.length <= 1 ? 'disabled' : ''}>${icon.trash(15)}</button>
      </li>`
      )
      .join('')}
  </ul>`;

  const { close, modal } = openModal({
    title: `Columns — ${DEVICE_KIND[kind]?.label || kind}`,
    subtitle: 'Rename, reorder, hide, add or remove. Only this type is affected.',
    wide: true,
    // openModal focuses its own first input on the next frame, which would land on
    // the first column's rename box. Passing initialFocus is the only way to win
    // that race — a focus() call in onMount is overwritten.
    initialFocus: options.addNew ? '#dc-new' : '',
    body: `<div class="dc-editor">
        <p class="dc-help">Drag a row, or use the arrows, to change column order.
          <strong>Field</strong> columns are built in for this device type;
          <strong>custom</strong> columns are yours, and can be deleted.</p>
        <div id="dc-list-host" class="dc-list-wrap">${listHTML()}</div>
        <button type="button" class="dc-more" data-more hidden>Show more columns</button>
        <div class="dc-add">
          <input class="input" id="dc-new" placeholder="New column name, e.g. IMEI" maxlength="60" />
          <button type="button" class="btn btn-sm" data-add>${icon.colPlus(13)} Add column</button>
        </div>
      </div>`,
    footer: `<button class="btn" data-cancel>Cancel</button>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-save>Save columns</button>`,
    onMount: (m) => {
      const host = m.querySelector('#dc-list-host');

      // Harvest input values before any repaint, or typing is lost on move.
      const harvest = () => {
        host.querySelectorAll('.dc-item').forEach((li, i) => {
          const input = li.querySelector('.dc-label');
          if (draft[i]) draft[i].label = input.value;
        });
      };
      // Cap the list at whole rows. The pitch depends on the item's rendered
      // height (which changes on narrow screens where a row wraps), so it is
      // measured rather than hard-coded — a CSS-only max-height sliced the next
      // row in half at the scroll edge, which reads as a rendering bug.
      // Whether the list overflows decides whether the edge fade is shown. The
      // height itself is left to CSS: an earlier version computed whole-row caps in
      // JS, but the row pitch is only correct after the buttons and inputs have
      // their final size, so the cap landed between rows anyway. A partially visible
      // row BEHIND a fade is the standard "there is more" cue; a partially visible
      // row with no fade and no visible scrollbar just looks cropped.
      // A fade alone did not register as a cue — it is too subtle at normal viewing
      // size, and the browser's scrollbar is an overlay that draws nothing until you
      // scroll. So the editor states it in words: when the list overflows, a "Show
      // more columns" button appears under it and scrolls the next row into view.
      const fitRows = () => {
        const list = host.querySelector('.dc-list');
        if (!list) return;
        const over = list.scrollHeight > list.clientHeight + 1;
        list.classList.toggle('is-scrollable', over);
        const more = m.querySelector('[data-more]');
        if (!more) return;
        const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
        more.hidden = !over || atEnd;
        if (!more.hidden) {
          const left = Math.max(0, list.scrollHeight - list.clientHeight - list.scrollTop);
          more.textContent = `Show more columns (${Math.ceil(left / 47)} more)`;
        }
      };
      m.querySelector('[data-more]')?.addEventListener('click', () => {
        host.querySelector('.dc-list')?.scrollBy({ top: 300, behavior: 'smooth' });
      });
      // Re-evaluate on scroll, otherwise the button still offers "more" after the
      // user has reached the end — the one state where an affordance must not lie.
      // Bound on the HOST in the capture phase, not on the list: every add/move/delete
      // rebuilds the list's DOM, so a listener on the node dies with the first edit and
      // the button silently stops tracking the scroll position.
      host.addEventListener('scroll', () => fitRows(), { passive: true, capture: true });
      const repaint = () => {
        host.innerHTML = listHTML();
        fitRows();
      };

      host.addEventListener('input', (ev) => {
        const li = ev.target.closest('.dc-item');
        if (!li) return;
        const i = [...host.querySelectorAll('.dc-item')].indexOf(li);
        if (ev.target.matches('[data-hide]')) draft[i].hidden = ev.target.checked;
        else if (ev.target.matches('.dc-label')) draft[i].label = ev.target.value;
      });

      host.addEventListener('click', (ev) => {
        const li = ev.target.closest('.dc-item');
        if (!li) return;
        const i = [...host.querySelectorAll('.dc-item')].indexOf(li);
        const move = ev.target.closest('[data-move]');
        if (move) {
          harvest();
          const to = i + Number(move.dataset.move);
          if (to < 0 || to >= draft.length) return;
          const [item] = draft.splice(i, 1);
          draft.splice(to, 0, item);
          repaint();
          return;
        }
        if (ev.target.closest('[data-del]')) {
          harvest();
          if (draft.length <= 1) return;
          draft.splice(i, 1);
          repaint();
        }
      });

      // Drag to reorder inside the editor.
      let from = -1;
      host.addEventListener('dragstart', (ev) => {
        const li = ev.target.closest('.dc-item');
        if (!li) return;
        from = [...host.querySelectorAll('.dc-item')].indexOf(li);
        li.classList.add('is-dragging');
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', String(from));
        }
      });
      host.addEventListener('dragover', (ev) => {
        const li = ev.target.closest('.dc-item');
        if (!li || from < 0) return;
        ev.preventDefault();
        host.querySelectorAll('.is-drop-before, .is-drop-after').forEach((el) =>
          el.classList.remove('is-drop-before', 'is-drop-after')
        );
        const rect = li.getBoundingClientRect();
        li.classList.add(ev.clientY > rect.top + rect.height / 2 ? 'is-drop-after' : 'is-drop-before');
      });
      host.addEventListener('drop', (ev) => {
        const li = ev.target.closest('.dc-item');
        if (!li || from < 0) return;
        ev.preventDefault();
        harvest();
        const target = [...host.querySelectorAll('.dc-item')].indexOf(li);
        const rect = li.getBoundingClientRect();
        const after = ev.clientY > rect.top + rect.height / 2;
        // Two steps: the insertion slot in the ORIGINAL list, then shift it down
        // when the dragged item sat to its left and has already been lifted out.
        const slot = after ? target + 1 : target;
        const to = slot > from ? slot - 1 : slot;
        const src = from;
        from = -1;
        if (to === src) {
          repaint();
          return;
        }
        const [item] = draft.splice(src, 1);
        draft.splice(to, 0, item);
        repaint();
      });
      host.addEventListener('dragend', () => {
        from = -1;
        host.querySelectorAll('.is-dragging, .is-drop-before, .is-drop-after').forEach((el) =>
          el.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after')
        );
      });

      m.querySelector('[data-add]').addEventListener('click', () => {
        const input = m.querySelector('#dc-new');
        const label = input.value.trim();
        if (!label) {
          toast('Give the column a name', 'err');
          input.focus();
          return;
        }
        harvest();
        // A key is derived from the label and made unique; it is what the values
        // are stored under, so it must never collide with an existing one.
        const base =
          label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 32) || 'col';
        let key = base;
        let n = 2;
        while (draft.some((c) => c.key === key)) key = `${base}_${n++}`;
        draft.push({ key, label, hidden: false, builtin: false });
        input.value = '';
        repaint();
        input.focus();
        // A new column lands at the end of the list, which is usually below the fold —
        // the user pressed "Add column" and saw nothing appear. Scroll it into view.
        requestAnimationFrame(() => {
          const list = host.querySelector('.dc-list');
          if (list) list.scrollTop = list.scrollHeight;
          fitRows();
        });
      });
      m.querySelector('#dc-new').addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          m.querySelector('[data-add]').click();
        }
      });
      fitRows();
      window.addEventListener('resize', fitRows);
      if (options.addNew) {
        // Bring the new-column row into view so the focused field is not off screen.
        requestAnimationFrame(() => {
          const list = host.querySelector('.dc-list');
          if (list) list.scrollTop = list.scrollHeight;
        });
      }
    },
  });

  modal.querySelector('[data-cancel]')?.addEventListener('click', close);
  modal.querySelector('[data-save]')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const items = [...modal.querySelectorAll('.dc-item')];
    const payload = items.map((li, i) => ({
      key: li.dataset.key,
      label: (li.querySelector('.dc-label')?.value || '').trim() || draft[i]?.label || 'Column',
      hidden: !!li.querySelector('[data-hide]')?.checked,
      builtin: draft.find((c) => c.key === li.dataset.key)?.builtin ?? false,
    }));
    if (payload.some((c, i) => !c.label || draft[i] === undefined)) {
      // Defensive: a repaint between harvest and read would leave a gap.
      toast('One column has no name', 'err');
      return;
    }
    btn.disabled = true;
    try {
      const res = await api.saveDeviceColumns(kind, payload);
      state.deviceColumns = { ...state.deviceColumns, [kind]: res.columns };
      close();
      toast('Columns saved', 'ok');
      await loadDevices();
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });
}


export function bindDevices() {
  // Import lives in the page head, which `mountContent` re-creates on every repaint,
  // so the listener is bound here with the rest of the page's controls.
  document.querySelectorAll('[data-device-import]').forEach((b) =>
    b.addEventListener('click', () => openDeviceImport())
  );
  document.querySelectorAll('[data-device-kind]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (state.deviceKind === b.dataset.deviceKind) return;
      state.deviceKind = b.dataset.deviceKind;
      localStorage.setItem('opm-device-kind', state.deviceKind);
      state.devices = [];
      await loadDevices();
    })
  );
  // The trailing sheet row carries both "Add a row" and "Add a column": they are the
  // same kind of action (one more of the thing you are looking at), so they sit
  // together at the end of the grid. Both are bound in bindDeviceRows() because that
  // row is re-created by every repaint.
  // The toolbar, the empty state and the trailing "+ Add device" row all carry this
  // attribute, and bindDeviceRows() binds it after every repaint. Guarding on a flag
  // keeps a single listener per node — two listeners opened the form twice, which
  // looked like a duplicate form and doubled every field in the DOM.
  document.querySelectorAll('[data-device-new]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => openDeviceForm());
  });
  document.querySelectorAll('[data-device-cols]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => openColumnEditor());
  });
  // Edit/delete live in bindDeviceRows(): the search box re-renders only the
  // table body, so those handlers have to be re-attachable without a full page
  // render.
  const clear = document.querySelector('[data-device-clear]');
  if (clear) {
    clear.addEventListener('click', async () => {
      state.deviceQuery = '';
      await loadDevices();
      document.getElementById('device-search')?.focus();
    });
  }
  const search = document.getElementById('device-search');
  if (search) {
    let t;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        state.deviceQuery = search.value;
        // Keep the caret where it is: re-rendering the whole page on each
        // keystroke would blur the field mid-word.
        const rows = await api
          .devices({ kind: state.deviceKind, q: state.deviceQuery.trim() })
          .catch(() => null);
        if (!rows) return;
        state.devices = rows.devices;
        repaintDeviceRows();
        // The toolbar is NOT re-rendered (that would blur the field being typed
        // in), so its Clear button has to be toggled here by hand.
        const cb = document.querySelector('[data-device-clear]');
        if (cb) cb.hidden = !state.deviceQuery;
        bindDeviceRows();
        // The empty state owns its own "Add device" button, so it needs wiring
        // too when a search empties the table.
        document.querySelectorAll('[data-device-new]').forEach((b) => {
          if (b.dataset.bound) return;
          b.dataset.bound = '1';
          b.addEventListener('click', () => openDeviceForm());
        });
      }, 200);
    });
  }
  bindDeviceRows();
}


/** Row-level handlers, re-bound after every partial re-render. */
/**
 * Reveal the scroll affordances only when a table genuinely overflows, and drop the
 * left shadow once the user is back at the start. Runs after every render and on
 * resize, because whether it fits depends on the pane width.
 *
 * Takes the wrapper rather than querying one, because there are two tables in this
 * app and they must fade, hint and shadow identically: the inventory's `.dev-table`
 * and the Information center's sheet, which is the same table.
 */
export function syncTableOverflow(wrap) {
  if (!wrap) return;
  const slack = wrap.scrollWidth - wrap.clientWidth;
  const overflow = slack > 1;
  wrap.classList.toggle('can-right', overflow && wrap.scrollLeft < slack - 1);
  wrap.classList.toggle('can-left', overflow && wrap.scrollLeft > 1);
  if (!wrap.dataset.scrollBound) {
    wrap.dataset.scrollBound = '1';
    wrap.addEventListener('scroll', () => syncTableOverflow(wrap), { passive: true });
  }
}


export function syncDeviceOverflow() {
  syncTableOverflow(document.querySelector('[data-dev-scroll]'));
}

/**
 * Drag a row to reorder the inventory.
 *
 * The grip cell is the drag handle and the only draggable element, so a drag
 * never starts from a text field or a button. Order is persisted immediately on
 * drop rather than behind a Save button: dragging IS the commit, and a silent
 * unsaved state would be lost on the next reload.
 */
/**
 * Drag a column header to move that column.
 *
 * Bound on `thead` and stopped there: the row-drag handler is bound on the whole
 * table and calls preventDefault() on any dragstart that is not a row grip, so a
 * column drag has to be intercepted above it or it would be cancelled before it
 * began.
 *
 * Only VISIBLE columns can be dragged. A hidden column still occupies a slot in the
 * saved config, so after the drop the full config is rebuilt by walking it and
 * substituting the new visible order into the non-hidden positions — that way a
 * hidden column keeps its place instead of being shuffled to the end whenever its
 * neighbours move.
 */
export function bindDeviceColumnDrag() {
  const table = document.querySelector('.dev-table');
  if (!table || table.dataset.colDragBound) return;
  table.dataset.colDragBound = '1';
  const head = table.querySelector('thead');
  if (!head) return;

  let fromIdx = null;
  const clearColMarks = () => {
    head
      .querySelectorAll('.is-col-dragging, .is-col-drop-before, .is-col-drop-after')
      .forEach((el) => el.classList.remove('is-col-dragging', 'is-col-drop-before', 'is-col-drop-after'));
  };

  head.addEventListener('dragstart', (ev) => {
    const th = ev.target.closest('th[data-dev-colhead]');
    if (!th) return;
    ev.stopPropagation();
    fromIdx = Number(th.dataset.devColhead);
    th.classList.add('is-col-dragging');
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(fromIdx));
    }
  });

  head.addEventListener('dragover', (ev) => {
    if (fromIdx === null) return;
    const th = ev.target.closest('th[data-dev-colhead]');
    if (!th) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    const rect = th.getBoundingClientRect();
    const after = ev.clientX > rect.left + rect.width / 2;
    clearColMarks();
    head.querySelector(`th[data-dev-colhead="${fromIdx}"]`)?.classList.add('is-col-dragging');
    th.classList.add(after ? 'is-col-drop-after' : 'is-col-drop-before');
  });

  head.addEventListener('drop', async (ev) => {
    if (fromIdx === null) return;
    const th = ev.target.closest('th[data-dev-colhead]');
    if (!th) return;
    ev.preventDefault();
    ev.stopPropagation();
    const targetIdx = Number(th.dataset.devColhead);
    const rect = th.getBoundingClientRect();
    const after = ev.clientX > rect.left + rect.width / 2;
    const from = fromIdx;
    fromIdx = null;
    clearColMarks();
    // Two steps, because collapsing "insert before slot N" and "move from index F"
    // into one arithmetic is where off-by-one bugs live.
    const slot = after ? targetIdx + 1 : targetIdx;
    const to = slot > from ? slot - 1 : slot;
    if (to === from) return;

    const kind = state.deviceKind;
    const full = (state.deviceColumns?.[kind] || []).map((c) => ({ ...c }));
    if (!full.length) return;
    const visible = full.filter((c) => !c.hidden);
    const moved = visible.splice(from, 1)[0];
    if (!moved) return;
    visible.splice(to, 0, moved);
    // Re-insert the hidden columns at their original slots.
    let vi = 0;
    const next = full.map((c) => (c.hidden ? c : visible[vi++]));
    try {
      const res = await api.saveDeviceColumns(kind, next);
      state.deviceColumns = { ...state.deviceColumns, [kind]: res.columns };
      await loadDevices();
      toast('Column moved', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  head.addEventListener('dragend', () => {
    fromIdx = null;
    clearColMarks();
  });
}


/**
 * The drop marker's labelled pill. It is a real element rather than a
 * pseudo-element because both of a row's pseudo-elements are already spent on the
 * insertion bar and its leading tick — sharing `::before` stretched the pill into a
 * second full-width bar, so the label never appeared on screen.
 */
export function setDropPill(tr, side) {
  document.querySelectorAll('.dev-drop-pill').forEach((el) => el.remove());
  if (!tr) return;
  // Attach to the grip CELL, not the row: a <tr> may only contain <td>/<th>, and a
  // stray <span> inside one makes the table layout algorithm redistribute column
  // widths — measured as 1-3px header drift the moment the marker appeared. The
  // grip cell is already `position: relative`, so it is also the right anchor.
  const host = tr.querySelector('td.dev-grip') || tr.firstElementChild;
  if (!host) return;
  const pill = document.createElement('span');
  pill.className = `dev-drop-pill ${side === 'after' ? 'is-after' : 'is-before'}`;
  pill.textContent = 'drop here';
  pill.setAttribute('aria-hidden', 'true');
  host.appendChild(pill);
}


export function bindDeviceRowDrag() {
  const table = document.querySelector('.dev-table');
  const wrap = document.querySelector('[data-dev-scroll]');
  if (!table || !wrap || table.dataset.dragBound) return;
  table.dataset.dragBound = '1';

  let fromId = null;
  const clearMarks = () => {
    table.querySelectorAll('.is-drop-before, .is-drop-after, .is-dragging').forEach((el) =>
      el.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging')
    );
    table.querySelectorAll('.dev-drop-pill').forEach((el) => el.remove());
  };
  // Touching ONLY the drop marker. `clearMarks()` also strips `is-dragging` from the
  // row in flight, and re-adding it on every `dragover` meant the drag SOURCE was
  // mutating while the drag was live — Chromium then abandons the gesture, `drop`
  // never fires, and `dragend` reports `dropEffect: 'none'`. The move was silently
  // thrown away, which is exactly "I dragged it and nothing moved".
  const clearDrop = () => {
    table.querySelectorAll('.is-drop-before, .is-drop-after').forEach((el) =>
      el.classList.remove('is-drop-before', 'is-drop-after')
    );
    table.querySelectorAll('.dev-drop-pill').forEach((el) => el.remove());
  };

  // The marker is state, not an animation: `dragover` fires on every pixel of
  // mouse movement, so blindly clearing and re-adding classes repainted the whole
  // table tens of times per second. That churn is what looked like every row
  // lighting up at once. Track the current marker and only touch the DOM when it
  // actually changes.
  let markRow = null;
  let markSide = '';
  // Set while a real `drop` is handled, so the `dragend` that always follows it
  // does not apply the same move a second time.
  let settled = false;

  const setMark = (tr, side) => {
    if (markRow === tr && markSide === side) return;
    if (markRow && markRow !== tr) markRow.classList.remove('is-drop-before', 'is-drop-after');
    clearDrop();
    markRow = tr;
    markSide = side;
    if (tr) tr.classList.add(side === 'after' ? 'is-drop-after' : 'is-drop-before');
    setDropPill(tr, side);
  };
  const resetMark = () => {
    markRow = null;
    markSide = '';
  };

  table.addEventListener('dragstart', (ev) => {
    const grip = ev.target.closest('[data-dev-row] .dev-grip');
    if (!grip) {
      ev.preventDefault();
      return;
    }
    const tr = grip.closest('tr');
    fromId = Number(tr.dataset.devRow);
    resetMark();
    tr.classList.add('is-dragging');
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      // Firefox refuses to start a drag without a payload.
      ev.dataTransfer.setData('text/plain', String(fromId));
    }
  });

  table.addEventListener('dragover', (ev) => {
    if (fromId === null) return;
    const tr = ev.target.closest('tr[data-dev-row]');
    if (!tr) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    const rect = tr.getBoundingClientRect();
    const after = ev.clientY > rect.top + rect.height / 2;
    // A marker that promises a move which cannot happen is the other half of the
    // "the line appeared but nothing moved" complaint: dropping a row above itself
    // and dropping it below itself both leave the order unchanged, so neither
    // should draw a drop line.
    const targetId = Number(tr.dataset.devRow);
    const ids = state.devices.map((d) => Number(d.id));
    const fromIdx = ids.indexOf(fromId);
    const targetIdx = ids.indexOf(targetId);
    const slot = after ? targetIdx + 1 : targetIdx;
    const to = slot > fromIdx ? slot - 1 : slot;
    if (fromIdx < 0 || targetIdx < 0 || to === fromIdx) {
      clearDrop();
      resetMark();
      return;
    }
    setMark(tr, after ? 'after' : 'before');
  });

  /**
   * Commit the move the marker was promising. `to` is the index in the ORIGINAL
   * array where the row should end up.
   */
  const commitMove = async (src, to) => {
    const ids = state.devices.map((d) => Number(d.id));
    const fromIdx = ids.indexOf(src);
    if (fromIdx < 0 || fromIdx === to) return;
    ids.splice(fromIdx, 1);
    ids.splice(to, 0, src);

    // Repaint optimistically from the new order so the drop feels instant.
    const byId = new Map(state.devices.map((d) => [Number(d.id), d]));
    state.devices = ids.map((id) => byId.get(id)).filter(Boolean);
    repaintDeviceRows();

    try {
      await api.reorderDevices(state.deviceKind, ids);
    } catch (err) {
      toast(err.message, 'err');
      await loadDevices();
    }
  };

  table.addEventListener('drop', async (ev) => {
    if (fromId === null) return;
    const tr = ev.target.closest('tr[data-dev-row]');
    if (!tr) return;
    ev.preventDefault();
    const targetId = Number(tr.dataset.devRow);
    const rect = tr.getBoundingClientRect();
    const after = ev.clientY > rect.top + rect.height / 2;
    const src = fromId;
    fromId = null;
    settled = true;
    resetMark();
    clearMarks();
    if (src === targetId) return;

    const ids = state.devices.map((d) => Number(d.id));
    const fromIdx = ids.indexOf(src);
    const targetIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || targetIdx < 0) return;
    // Two steps: the insertion slot in the ORIGINAL array, then shift it down one
    // when the dragged row sat above the drop target and has been lifted out.
    const slot = after ? targetIdx + 1 : targetIdx;
    await commitMove(src, slot > fromIdx ? slot - 1 : slot);
  });

  table.addEventListener('dragend', () => {
    const src = fromId;
    // The browser can abandon a drag it thinks is invalid: no `drop`, just a
    // `dragend` with dropEffect 'none'. Measured 3 times in 8 attempts, which read
    // to the tester as "the line appeared but nothing moved". The marker the user
    // was looking at is a clear statement of intent, so honour it instead of
    // discarding the gesture.
    const pending = markRow ? { targetId: Number(markRow.dataset.devRow), side: markSide } : null;
    const wasSettled = settled;
    fromId = null;
    settled = false;
    resetMark();
    clearMarks();
    if (!src || wasSettled) return;
    if (!pending || src === pending.targetId) return;

    const ids = state.devices.map((d) => Number(d.id));
    const fromIdx = ids.indexOf(src);
    const targetIdx = ids.indexOf(pending.targetId);
    if (fromIdx < 0 || targetIdx < 0) return;
    const slot = pending.side === 'after' ? targetIdx + 1 : targetIdx;
    const to = slot > fromIdx ? slot - 1 : slot;
    if (to === fromIdx) return;
    commitMove(src, to);
  });
}


/** Repaint only the table body + cards, leaving the toolbar (and its caret) alone. */
export function repaintDeviceRows() {
  if (state.deviceEdit) {
    // Bulk mode renders ONE table, not a desktop and a mobile copy: duplicate
    // inputs meant a hidden twin took part in Tab order and in the dirty-cell
    // count, so one real edit could read as two changes.
    const host = document.querySelector('.dev-bulkhost');
    if (host) host.innerHTML = devicesTableHTML(state.devices);
    bindDeviceRows();
    return;
  }
  const desk = document.querySelector('.dev-desktop');
  const mob = document.querySelector('.dev-mobile');
  if (desk) desk.innerHTML = devicesTableHTML(state.devices);
  if (mob) mob.innerHTML = devicesCardsHTML(state.devices);
  bindDeviceRows();
}


export function bindDeviceRows() {
  // Everything in this function is re-created by every repaint, so each binding must
  // live here (guarded by data-bound) and NOT only in bindDevices(). The trailing
  // sheet row's "Add a column" button is the case that proved it: bound once in
  // bindDevices(), it lost its listener the first time a row drag repainted the table
  // and then did nothing at all.
  document.querySelectorAll('[data-bulk-addrow]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => addPendingRow());
  });
  // The trailing "+ Add device" row and the empty state both carry data-device-new
  // and are re-created by every repaint, so they need wiring here and not only in
  // bindDevices().
  document.querySelectorAll('[data-device-new]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => openDeviceForm());
  });
  // "Add a column" sits beside "Add a row" in the trailing sheet row.
  document.querySelectorAll('[data-device-addcol]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => openColumnEditor({ addNew: true }));
  });
  document.querySelectorAll('[data-device-edit]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => {
      const d = state.devices.find((x) => Number(x.id) === Number(b.dataset.deviceEdit));
      if (d) openDeviceForm(d);
    });
  });
  document.querySelectorAll('[data-device-del]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', async () => {
      const d = state.devices.find((x) => Number(x.id) === Number(b.dataset.deviceDel));
      if (!d) return;
      const ok = await confirmDialog({
        title: 'Delete this device?',
        message: `“${d.name}” will be removed from the inventory for everyone.`,
        confirmLabel: 'Delete device',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteDevice(d.id);
        toast('Device deleted', 'ok');
        await loadDevices();
        await loadStats();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });
  document.querySelectorAll('[data-device-bulk]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => startBulkEdit());
  });
  document.querySelectorAll('[data-bulk-cancel]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', async () => {
      // Only nag when something would actually be thrown away: a user who opened
      // the mode to look around should not have to confirm leaving it.
      if (bulkDirtyCount()) {
        const ok = await confirmDialog({
          title: 'Discard your edits?',
          message: 'The cells you changed will go back to the values currently saved.',
          confirmLabel: 'Discard changes',
          danger: true,
        });
        if (!ok) return;
      }
      cancelBulkEdit();
    });
  });
  document.querySelectorAll('[data-pending-drop]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => {
      removePendingRow(b.dataset.pendingDrop);
      toast('Unsaved row removed', 'info');
    });
  });
  document.querySelectorAll('[data-bulk-save]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => saveBulkEdit(b));
  });
  bindBulkCells();
  bindDeviceRowDrag();
  bindDeviceColumnDrag();
  syncDeviceOverflow();
}


/* ---- devices ------------------------------------------------------------ */

/** Normalise a header cell: `Name Device` and `name_device` both become `namedevice`. */
export function headerKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}


/**
 * Map a header row onto the kind's fields, or null when the row is not a header.
 *
 * A spreadsheet export carries its column names, and those are free ordering
 * information: if two or more cells name fields, trust the labels instead of
 * asking the operator to reorder their file. Below two matches it is far more
 * likely to be a device whose values happen to match a label.
 */
export function deviceHeaderMap(cells, fields, labels) {
  const lookup = new Map();
  for (const key of fields) {
    lookup.set(headerKey(key), key);
    lookup.set(headerKey(labels[key] || key), key);
  }
  // Common spellings a spreadsheet invents for these columns.
  const alias = {
    namedevice: 'name',
    device: 'name',
    devicename: 'name',
    uniqueid: 'serial',
    sn: 'serial',
    who: 'whoUsed',
    whohas: 'whoUsed',
    owner: 'whoUsed',
    type: 'edcType',
    edctype: 'edcType',
    notes: 'notes',
    note: 'notes',
  };
  const map = cells.map((cell) => lookup.get(headerKey(cell)) || alias[headerKey(cell)] || null);
  const hits = map.filter((key) => key && fields.includes(key)).length;
  return hits >= 2 ? map : null;
}


/**
 * Parse a pasted device list for one kind.
 *
 * Two shapes are accepted, because both arrive in practice: a file exported with
 * its header row (mapped by label, in any order) and a bare list (read
 * positionally in the kind's field order, starting with the device name). Cells
 * past the last field are appended to notes rather than dropped — an extra column
 * in someone's sheet is still information.
 */
export function parseDeviceImport(text, kind) {
  const fields = state.deviceFields[kind] || [];
  const labels = state.deviceLabels || {};
  const rows = [];
  let header = null;
  let first = true;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = splitImportLine(line);
    if (first) {
      first = false;
      const map = deviceHeaderMap(cells, fields, labels);
      if (map) {
        header = map;
        continue;
      }
    }

    const values = {};
    if (header) {
      cells.forEach((cell, i) => {
        const key = header[i];
        if (key) values[key] = cell;
      });
    } else {
      fields.forEach((key, i) => {
        values[key] = cells[i] ?? '';
      });
      const extra = cells.slice(fields.length).filter(Boolean);
      if (extra.length) {
        values.notes = [values.notes, ...extra].filter(Boolean).join(' — ');
      }
    }

    const name = String(values.name || '').trim();
    let error = '';
    if (!name) error = 'No device name';
    rows.push({ raw: line, kind, name, values, error });
  }
  return rows;
}


/** A compact summary of everything the row carries besides its name. */
export function deviceImportDetails(row) {
  const labels = state.deviceLabels || {};
  const parts = [];
  for (const key of state.deviceFields[row.kind] || []) {
    if (key === 'name') continue;
    const value = String(row.values[key] ?? '').trim();
    if (!value) continue;
    // Notes hold sentences; the label would only repeat the name of the column.
    parts.push(key === 'notes' ? value : `${labels[key] || key}: ${value}`);
  }
  return parts.join(' · ') || '—';
}


export function deviceImportPreviewHTML(rows) {
  if (!rows.length) {
    return `<p class="form-hint">Nothing parsed yet — paste a list above or choose a file.</p>`;
  }
  const head = [['Name device'], ['Details', 'imp-hide-sm'], ['Status']];
  return `<div class="dev-tablewrap imp-preview">
      <table class="dev-table">
        <thead><tr>${impHead(head)}</tr></thead>
        <tbody>${rows
          .map((r) => {
            const details = deviceImportDetails(r);
            return `<tr>
            <td class="dev-name imp-name" title="${h(r.name || '')}">${h(r.name || '—')}</td>
            <td class="dev-notes imp-details imp-hide-sm" title="${h(details)}">${h(details)}</td>
            <td class="dev-notes ${r.error ? 'imp-bad' : 'imp-ok'}">${h(r.error || 'Ready')}</td>
          </tr>`;
          })
          .join('')}</tbody>
      </table>
    </div>`;
}


/**
 * Import devices of one type from a pasted list or a file.
 *
 * The type is chosen in the dialog rather than read from the file: the kind
 * decides which columns exist, and guessing it from the data would be wrong
 * exactly when it matters (an EDC and a Misc row both start with a name).
 */
export function openDeviceImport() {
  const startKind = state.deviceKinds.includes(state.deviceKind) ? state.deviceKind : state.deviceKinds[0];
  const fieldList = (kind) => (state.deviceFields[kind] || []).map((k) => state.deviceLabels[k] || k);
  openModal({
    title: 'Import devices',
    subtitle: 'Paste a list or choose a file — one device per line',
    xwide: true,
    body: `
      <div class="field">
        <label class="label">Type</label>
        ${segmented(
          'imp-kind',
          state.deviceKinds.map((k) => ({ value: k, label: DEVICE_KIND[k]?.label || k })),
          startKind,
          { Android: 'green', iOS: 'slate', EDC: 'amber', Misc: 'violet' }
        )}
        <span class="form-hint" id="imp-kind-hint"></span>
      </div>
      <div class="field">
        <label class="label" for="imp-devices">List</label>
        <textarea class="textarea code" id="imp-devices" rows="8" spellcheck="false"></textarea>
        <span class="form-hint" id="imp-device-hint"></span>
      </div>
      <div class="imp-file-row">
        <input type="file" id="imp-device-file" accept=".csv,.tsv,.txt,text/plain,text/csv" hidden />
        <button type="button" class="btn btn-sm" data-imp-file>${icon.fileText(13)} Choose a file…</button>
        <span class="form-hint" id="imp-device-file-name"></span>
      </div>
      <div id="imp-device-failures"></div>
      <div id="imp-device-preview"></div>`,
    footer: `<span class="imp-tally" id="imp-device-tally"></span>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-import disabled>Import</button>`,
    onMount: (modal, close) => {
      const text = modal.querySelector('#imp-devices');
      const preview = modal.querySelector('#imp-device-preview');
      const tally = modal.querySelector('#imp-device-tally');
      const failures = modal.querySelector('#imp-device-failures');
      const fileName = modal.querySelector('#imp-device-file-name');
      const fileInput = modal.querySelector('#imp-device-file');
      const go = modal.querySelector('[data-import]');

      const kindNow = () => segmentedValue(modal, 'imp-kind') || startKind;

      const render = () => {
        const kind = kindNow();
        modal.querySelector('#imp-kind-hint').textContent = `${kind}: ${fieldList(kind).join(' · ')}`;
        modal.querySelector('#imp-device-hint').textContent =
          'Only the device name is required. Columns are read in that order, unless the first line names them — a spreadsheet header is matched by label, in any order.';
        const rows = parseDeviceImport(text.value, kind);
        preview.innerHTML = deviceImportPreviewHTML(rows);
        const ok = rows.filter((r) => !r.error).length;
        tally.textContent = rows.length ? `${ok} ready${rows.length - ok ? `, ${rows.length - ok} with problems` : ''}` : '';
        go.disabled = ok === 0;
        go.textContent = ok ? `Import ${ok} device${ok === 1 ? '' : 's'}` : 'Import';
        if (rows.length) failures.innerHTML = '';
      };

      bindSegmented(modal, 'imp-kind', render);
      text.addEventListener('input', render);
      modal.querySelector('[data-imp-file]').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        fileName.textContent = file.name;
        text.value = await file.text();
        render();
      });
      modal.querySelector('[data-cancel]').addEventListener('click', close);

      go.addEventListener('click', async () => {
        const kind = kindNow();
        const rows = parseDeviceImport(text.value, kind).filter((r) => !r.error);
        if (!rows.length) return;
        go.disabled = true;
        go.textContent = 'Importing…';
        const failed = [];
        let created = 0;

        for (const row of rows) {
          try {
            // Only the kind's own fields: the endpoint ignores the rest, but sending
            // them would make a typo look like a supported column.
            const payload = { kind };
            for (const key of state.deviceFields[kind] || []) {
              if (row.values[key] !== undefined) payload[key] = row.values[key];
            }
            await api.createDevice(payload);
            created += 1;
          } catch (err) {
            failed.push(`${row.name}: ${err.message}`);
          }
        }

        await loadDevices();
        if (!failed.length) {
          toast(`${created} device${created === 1 ? '' : 's'} imported`);
          close();
          return;
        }
        text.value = rows
          .filter((r) => failed.some((f) => f.startsWith(`${r.name}:`)))
          .map((r) => r.raw)
          .join('\n');
        toast(`${created} imported, ${failed.length} failed`, 'err');
        render();
        failures.innerHTML = `<div class="callout imp-failures">
            <span><strong>${failed.length} could not be created</strong></span>
            <ul>${failed.map((f) => `<li>${h(f)}</li>`).join('')}</ul>
          </div>`;
      });

      render();
    },
  });
}
