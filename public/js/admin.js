import { refreshAll } from './projects.js';
import { findVariant, refreshCatalog } from './shared.js';
import { state } from './state.js';
import { bindPicker, pickerValues, splitImportLine, supervisorPickerHTML } from './users.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { confirmDialog, escapeHtml as h, initials, openModal, toast } from './ui.js';


/* ============================================================
   admin panel — clients & applications
   ============================================================ */
export function adminHTML() {
  if (!state.clients.length) {
    return `<div class="admin">
      <div class="admin-head">
        <p>Every project belongs to a client and one of that client's applications.</p>
        <span class="admin-head-actions">
          <button class="btn" data-client-import>${icon.upload(13)} Import</button>
          <button class="btn btn-primary" id="admin-add-client">${icon.plus()} New client</button>
        </span>
      </div>
      <div class="empty">
        <div class="icon">${icon.building(28)}</div>
        <h3>No clients yet</h3>
        <p>Add a client first, then add the applications you pentest for them.</p>
        <button class="btn btn-primary" id="admin-add-client">${icon.plus()} New client</button>
      </div>
    </div>`;
  }

  return `<div class="admin">
    <div class="admin-head">
      <p>Every project belongs to a client and one of that client's applications.</p>
      <span class="admin-head-actions">
        <button class="btn" data-client-import>${icon.upload(13)} Import</button>
        <button class="btn btn-primary" id="admin-add-client">${icon.plus()} New client</button>
      </span>
    </div>
    <div class="client-grid">
      ${state.clients.map(clientCardHTML).join('')}
    </div>
  </div>`;
}


/**
 * One application inside a client card, plus its sub apps.
 *
 * A sub app (also "variant") is the optional third level, Client → Application →
 * Sub app: a separate product delivered under the same application, named by the
 * team. `Brilink` has `Brilink MPOS`, `Brilink Mobile` and `Brilink Web`; they are
 * three things you test separately, not three builds of one thing. An application
 * with no sub apps shows one quiet "+ Sub app" line and nothing else, because the
 * level is optional and must not read like a missing field.
 */
export function applicationBlockHTML(a) {
  const variants = a.variants || [];
  return `
    <div class="app-block">
      <div class="app-row">
        <span class="app-glyph">${icon.apps()}</span>
        <span class="app-name">${h(a.name)}</span>
        <span class="app-count">${a.projectCount} project${a.projectCount === 1 ? '' : 's'}</span>
        <button class="app-act" data-app-edit="${a.id}" aria-label="Rename application">${icon.edit()}</button>
        <button class="app-act" data-variant-add="${a.id}" aria-label="Add a sub app to ${h(a.name)}">${icon.plus()}</button>
        <button class="app-act danger" data-app-del="${a.id}" aria-label="Delete application">${icon.trash()}</button>
      </div>
      <div class="variant-list">
        ${variants.map((v) => variantRowHTML(v)).join('')}
        <button class="variant-add" data-variant-add="${a.id}">${icon.plus()} Sub app</button>
      </div>
    </div>`;
}


export function variantRowHTML(v) {
  return `
    <div class="variant-row">
      <span class="variant-name">${h(v.name)}</span>
      <span class="variant-count">${v.projectCount} project${v.projectCount === 1 ? '' : 's'}</span>
      <button class="app-act" data-variant-edit="${v.id}" aria-label="Edit sub app ${h(v.name)}">${icon.edit()}</button>
      <button class="app-act danger" data-variant-del="${v.id}" aria-label="Delete sub app ${h(v.name)}">${icon.trash()}</button>
    </div>`;
}


export function clientCardHTML(c) {
  const apps = state.applications.filter((a) => Number(a.clientId) === Number(c.id));
  return `
    <div class="client-card" data-client="${c.id}">
      <div class="client-card-head">
        <div class="cc-avatar">${h(initials(c.name))}</div>
        <div class="cc-title">
          <h3>${h(c.name)}</h3>
          <div class="cc-meta">
            ${c.shortName ? `<span class="tag">${h(c.shortName)}</span>` : ''}
            <span>${c.applicationCount} app${c.applicationCount === 1 ? '' : 's'}</span>
            <span>${c.projectCount} project${c.projectCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="cc-actions">
          <button class="btn btn-icon" data-client-edit="${c.id}" aria-label="Edit client">${icon.edit()}</button>
          <button class="btn btn-icon danger" data-client-del="${c.id}" aria-label="Delete client">${icon.trash()}</button>
        </div>
      </div>
      <div class="app-list">
        ${
          apps.length
            ? apps.map(applicationBlockHTML).join('')
            : '<div class="app-empty">No applications yet — add the first one.</div>'
        }
      </div>
      <div class="cc-supervisors">
        <span class="cc-m-label">${icon.userCheck(12)} Default SV</span>
        ${
          (c.supervisors || []).length
            ? `<span class="cc-m-list">${c.supervisors
                .map((m) => `<span class="cc-m-chip" title="${h(m.email || '')}">${h(m.name)}</span>`)
                .join('')}</span>`
            : `<span class="cc-m-empty">None — set one so new projects auto-assign a SV</span>`
        }
      </div>
      <button class="btn btn-sm app-add" data-app-add="${c.id}">${icon.plus()} Add application</button>
    </div>`;
}


export function bindAdmin() {
  document.querySelectorAll('#admin-add-client').forEach((b) => b.addEventListener('click', () => openClientForm()));
  document.querySelectorAll('[data-client-import]').forEach((b) => b.addEventListener('click', () => openClientImport()));
  document.querySelectorAll('[data-client-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openClientForm(state.clients.find((c) => Number(c.id) === Number(b.dataset.clientEdit)))
    )
  );
  document.querySelectorAll('[data-client-del]').forEach((b) =>
    b.addEventListener('click', () => deleteClient(state.clients.find((c) => Number(c.id) === Number(b.dataset.clientDel))))
  );
  document.querySelectorAll('[data-app-add]').forEach((b) =>
    b.addEventListener('click', () => openApplicationForm(Number(b.dataset.appAdd)))
  );
  document.querySelectorAll('[data-app-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openApplicationForm(null, state.applications.find((a) => Number(a.id) === Number(b.dataset.appEdit)))
    )
  );
  document.querySelectorAll('[data-app-del]').forEach((b) =>
    b.addEventListener('click', () =>
      deleteApplication(state.applications.find((a) => Number(a.id) === Number(b.dataset.appDel)))
    )
  );
  document.querySelectorAll('[data-variant-add]').forEach((b) =>
    b.addEventListener('click', () => openVariantForm(Number(b.dataset.variantAdd)))
  );
  document.querySelectorAll('[data-variant-edit]').forEach((b) =>
    b.addEventListener('click', () => openVariantForm(null, findVariant(b.dataset.variantEdit)))
  );
  document.querySelectorAll('[data-variant-del]').forEach((b) =>
    b.addEventListener('click', () => deleteVariant(findVariant(b.dataset.variantDel)))
  );
}


export function openVariantForm(applicationId = null, variant = null) {
  const editing = Boolean(variant);
  const appId = variant ? Number(variant.applicationId) : Number(applicationId);
  const app = state.applications.find((a) => Number(a.id) === appId);
  if (!app) return toast('Application not found', 'err');
  openModal({
    title: editing ? 'Edit sub app' : 'New sub app',
    subtitle: app.name,
    body: `
      <div class="field">
        <label for="v-name">Sub app name <span class="required">*</span></label>
        <input class="input" id="v-name" placeholder="e.g. Brilink MPOS, Brilink Mobile, Brilink Web" value="${h(variant?.name || '')}" />
        <span class="hint">
          A sub app is a separate product under the same application, named however
          the team names it. Projects point at a sub app when the engagement is about
          it instead of the application as a whole.
        </span>
      </div>
      <div class="field">
        <label for="v-notes">Notes</label>
        <textarea class="textarea" id="v-notes" rows="2" placeholder="Optional">${h(variant?.notes || '')}</textarea>
      </div>`,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Add sub app'}</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      modal.querySelector('[data-save]').addEventListener('click', async () => {
        const name = modal.querySelector('#v-name').value.trim();
        if (!name) return toast('Sub app name is required', 'err');
        const payload = { name, notes: modal.querySelector('#v-notes').value };
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          if (editing) await api.updateVariant(variant.id, payload);
          else await api.createVariant(appId, payload);
          toast(editing ? 'Sub app updated' : 'Sub app added');
          close();
          await refreshCatalog();
          await refreshAll();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    },
  });
}


export async function deleteVariant(variant) {
  if (!variant) return;
  const ok = await confirmDialog({
    title: 'Delete sub app?',
    message: `"${variant.name}" will be removed, with any notes filed on it. Projects that point at it keep their application, but lose the sub app.`,
    confirmLabel: 'Delete sub app',
  });
  if (!ok) return;
  try {
    await api.deleteVariant(variant.id);
    toast('Sub app deleted');
    await refreshCatalog();
    await refreshAll();
  } catch (err) {
    toast(err.message, 'err');
  }
}


export function openClientForm(client = null) {
  const editing = Boolean(client);
  openModal({
    title: editing ? 'Edit client' : 'New client',
    subtitle: editing ? client.name : 'A client owns one or more applications',
    body: `
      <div class="field">
        <label for="c-name">Client name <span class="required">*</span></label>
        <input class="input" id="c-name" placeholder="e.g. Bank Nusantara" value="${h(client?.name || '')}" />
      </div>
      <div class="field">
        <label for="c-short">Short name</label>
        <input class="input" id="c-short" placeholder="e.g. BN" value="${h(client?.shortName || '')}" maxlength="12" />
        <span class="hint">Shown on project cards and in the table to save space.</span>
      </div>
      <div class="field">
        <div class="field-label">Usual supervisors</div>
        ${supervisorPickerHTML((client?.supervisors || []).map((m) => m.id))}
        <span class="hint">
          When you create a project for this client, its SV is pre-selected from
          this list. Several are allowed — the project still has one owner.
        </span>
      </div>
      <div class="field">
        <label for="c-notes">Notes</label>
        <textarea class="textarea" id="c-notes" rows="3" placeholder="Primary contact, engagement rules…">${h(client?.notes || '')}</textarea>
      </div>`,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Create client'}</button>`,
    onMount: (modal, close) => {
      bindPicker(modal);
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      modal.querySelector('[data-save]').addEventListener('click', async () => {
        const name = modal.querySelector('#c-name').value.trim();
        if (!name) return toast('Client name is required', 'err');
        const payload = {
          name,
          shortName: modal.querySelector('#c-short').value.trim(),
          notes: modal.querySelector('#c-notes').value,
          supervisorIds: pickerValues(modal),
        };
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          if (editing) await api.updateClient(client.id, payload);
          else await api.createClient(payload);
          toast(editing ? 'Client updated' : 'Client created');
          close();
          await refreshCatalog();
          await refreshAll();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    },
  });
}


export async function deleteClient(client) {
  if (!client) return;
  const ok = await confirmDialog({
    title: 'Delete client?',
    message: `"${client.name}" and its ${client.applicationCount} application(s) will be removed.`,
    confirmLabel: 'Delete client',
  });
  if (!ok) return;
  try {
    await api.deleteClient(client.id);
    toast('Client deleted');
    await refreshCatalog();
    await refreshAll();
  } catch (err) {
    toast(err.message, 'err');
  }
}


export function openApplicationForm(clientId = null, application = null) {
  const editing = Boolean(application);
  const ownerId = application ? Number(application.clientId) : Number(clientId);
  openModal({
    title: editing ? 'Edit application' : 'New application',
    subtitle: state.clients.find((c) => Number(c.id) === ownerId)?.name || '',
    body: `
      <div class="field">
        <label for="a-client">Client <span class="required">*</span></label>
        <select class="select" id="a-client">
          ${state.clients
            .map((c) => `<option value="${c.id}" ${Number(c.id) === ownerId ? 'selected' : ''}>${h(c.name)}</option>`)
            .join('')}
        </select>
      </div>
      <div class="field">
        <label for="a-name">Application name <span class="required">*</span></label>
        <input class="input" id="a-name" placeholder="e.g. Qitta, Brimo, Brilink" value="${h(application?.name || '')}" />
        <span class="hint">One application per web app, mobile app, API or EDC fleet.</span>
      </div>
      <div class="field">
        <label for="a-notes">Notes</label>
        <textarea class="textarea" id="a-notes" rows="2" placeholder="Optional">${h(application?.notes || '')}</textarea>
      </div>`,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Add application'}</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      modal.querySelector('[data-save]').addEventListener('click', async () => {
        const name = modal.querySelector('#a-name').value.trim();
        if (!name) return toast('Application name is required', 'err');
        const payload = {
          clientId: Number(modal.querySelector('#a-client').value),
          name,
          notes: modal.querySelector('#a-notes').value,
        };
        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          if (editing) await api.updateApplication(application.id, payload);
          else await api.createApplication(payload);
          toast(editing ? 'Application updated' : 'Application added');
          close();
          await refreshCatalog();
          await refreshAll();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    },
  });
}


export async function deleteApplication(app) {
  if (!app) return;
  const ok = await confirmDialog({
    title: 'Delete application?',
    message: `"${app.name}" will be removed from the client catalogue.`,
    confirmLabel: 'Delete application',
  });
  if (!ok) return;
  try {
    await api.deleteApplication(app.id);
    toast('Application deleted');
    await refreshCatalog();
    await refreshAll();
  } catch (err) {
    toast(err.message, 'err');
  }
}




/* ============================================================
   Import — the catalogue and the hardware inventory
   ============================================================
   The user import answers "a team arrives as a list". These two
   answer the same thing for the other two things that arrive as a
   list: a new client with its applications, and a box of devices
   with serials. Same shape as the user import — parse into a
   preview table, then write row by row so one bad line cannot take
   the rest down with it. */

/** `Bank Nusantara (BN)` -> name + short name. */
export function splitClientName(value) {
  const text = String(value || '').trim();
  const paren = text.match(/^(.*?)\s*\(([^)]{1,12})\)$/);
  if (paren && paren[1].trim()) return { name: paren[1].trim(), shortName: paren[2].trim() };
  return { name: text, shortName: '' };
}


/**
 * Parse a pasted client list.
 *
 * Only the client name is required. A short name can be written either in
 * parentheses after the name (`Bank Nusantara (BN)`) or as its own short cell;
 * applications go in a cell separated by `/` or `|` (`Mobile Banking / Internet
 * Banking`), which is the one convention that survives a spreadsheet column;
 * everything else becomes the client's notes.
 */
export function parseClientImport(text) {
  const existing = new Set((state.clients || []).map((c) => String(c.name || '').toLowerCase()));
  const seen = new Set();
  const rows = [];
  let first = true;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = splitImportLine(line);
    if (first) {
      first = false;
      // A spreadsheet export keeps its header row; it is not a client.
      if (/^(client\s*)?name$/i.test(cells[0] || '')) continue;
    }

    const split = splitClientName(cells[0]);
    let rest = cells.slice(1);
    let apps = [];
    let notes = '';

    // Applications first: the cell that carries them is the only one with a
    // separator, and a short name never contains `/`.
    const appAt = rest.findIndex((c) => /[/|]/.test(c));
    if (appAt >= 0) {
      apps = rest[appAt]
        .split(/[/|]/)
        .map((a) => a.trim())
        .filter(Boolean);
      rest = rest.filter((_, i) => i !== appAt);
    }

    let shortName = split.shortName;
    if (!shortName) {
      // A short name is short and has no spaces; anything longer is prose.
      const shortAt = rest.findIndex((c) => c && c.length <= 12 && !/\s/.test(c));
      if (shortAt >= 0) {
        shortName = rest[shortAt];
        rest = rest.filter((_, i) => i !== shortAt);
      }
    }
    notes = rest.filter(Boolean).join(' · ');

    const name = split.name;
    let error = '';
    if (!name) error = 'No client name';
    else if (existing.has(name.toLowerCase())) error = 'Already in the catalogue';
    else if (seen.has(name.toLowerCase())) error = 'Listed twice';
    if (name) seen.add(name.toLowerCase());

    rows.push({
      raw: line,
      name,
      shortName: shortName ? shortName.slice(0, 12) : '',
      apps: [...new Set(apps.map((a) => a.toLowerCase()))].map(
        (lower) => apps.find((a) => a.toLowerCase() === lower) || lower
      ),
      notes,
      error,
    });
  }
  return rows;
}


/**
 * Preview header cells. `cls` travels with the label so a column that is dropped on
 * a narrow screen disappears as a WHOLE column — hiding only its body cells left the
 * header behind and shifted every value one column to the left.
 */
export function impHead(cells) {
  return cells
    .map(
      ([label, cls]) =>
        `<th${cls ? ` class="${cls}"` : ''}><span class="dev-h-inner"><span class="dev-h-label">${h(label)}</span></span></th>`
    )
    .join('');
}


/** The client parse result as a table. */
export function clientImportPreviewHTML(rows) {
  if (!rows.length) {
    return `<p class="form-hint">Nothing parsed yet — paste a list above or choose a file.</p>`;
  }
  const head = [
    ['Name'],
    ['Short name'],
    ['Applications', 'imp-hide-sm'],
    ['Notes', 'imp-hide-sm'],
    ['Status'],
  ];
  return `<div class="dev-tablewrap imp-preview">
      <table class="dev-table">
        <thead><tr>${impHead(head)}</tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
            <td class="dev-name imp-name" title="${h(r.name || '')}">${h(r.name || '—')}</td>
            <td class="dev-mono-cell">${h(r.shortName || '—')}</td>
            <td class="dev-notes imp-details imp-hide-sm" title="${h(r.apps.join(', '))}">${
              r.apps.length ? h(r.apps.join(' · ')) : '—'
            }</td>
            <td class="dev-notes imp-details imp-hide-sm" title="${h(r.notes || '')}">${h(r.notes || '—')}</td>
            <td class="dev-notes ${r.error ? 'imp-bad' : 'imp-ok'}">${h(r.error || 'Ready')}</td>
          </tr>`
          )
          .join('')}</tbody>
      </table>
    </div>`;
}


/**
 * Import clients (and their applications) from a pasted list or a file.
 *
 * Applications are created after their client, one request at a time, and a
 * failed application is reported without losing the client that owns it — the
 * client is the thing the rest of the app needs.
 */
export function openClientImport() {
  openModal({
    title: 'Import clients',
    subtitle: 'Paste a list or choose a file — one client per line',
    xwide: true,
    body: `
      <div class="field">
        <label class="label" for="imp-clients">List</label>
        <textarea class="textarea code" id="imp-clients" rows="8" spellcheck="false"
          placeholder="Bank Nusantara (BN)
Bank Mandiri; BM; Mobile Banking / Internet Banking
SecurePay Devices;;;Payment terminals, EDC supplier
Bluewave Finance; BF; Paylater App;;Jakarta, contact: Ops"></textarea>
        <span class="form-hint">
          Only the client name is required. A short name can follow in parentheses or as
          its own cell; a cell separated by <code>/</code> becomes that client's
          applications; anything else becomes notes.
        </span>
      </div>
      <div class="imp-file-row">
        <input type="file" id="imp-client-file" accept=".csv,.tsv,.txt,text/plain,text/csv" hidden />
        <button type="button" class="btn btn-sm" data-imp-file>${icon.fileText(13)} Choose a file…</button>
        <span class="form-hint" id="imp-client-file-name"></span>
      </div>
      <div id="imp-client-failures"></div>
      <div id="imp-client-preview"></div>`,
    footer: `<span class="imp-tally" id="imp-client-tally"></span>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-import disabled>Import</button>`,
    onMount: (modal, close) => {
      const text = modal.querySelector('#imp-clients');
      const preview = modal.querySelector('#imp-client-preview');
      const tally = modal.querySelector('#imp-client-tally');
      const failures = modal.querySelector('#imp-client-failures');
      const fileName = modal.querySelector('#imp-client-file-name');
      const fileInput = modal.querySelector('#imp-client-file');
      const go = modal.querySelector('[data-import]');

      const render = () => {
        const rows = parseClientImport(text.value);
        preview.innerHTML = clientImportPreviewHTML(rows);
        const ok = rows.filter((r) => !r.error);
        const bad = rows.length - ok.length;
        const apps = ok.reduce((n, r) => n + r.apps.length, 0);
        tally.textContent = rows.length
          ? `${ok.length} ready${apps ? ` (+${apps} app${apps === 1 ? '' : 's'})` : ''}${
              bad ? `, ${bad} skipped` : ''
            }`
          : '';
        go.disabled = ok.length === 0;
        go.textContent = ok.length ? `Import ${ok.length} client${ok.length === 1 ? '' : 's'}` : 'Import';
        if (rows.length) failures.innerHTML = '';
      };

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
        const rows = parseClientImport(text.value).filter((r) => !r.error);
        if (!rows.length) return;
        go.disabled = true;
        go.textContent = 'Importing…';
        const failed = [];
        let createdClients = 0;
        let createdApps = 0;

        for (const row of rows) {
          let client;
          try {
            const res = await api.createClient({
              name: row.name,
              shortName: row.shortName,
              notes: row.notes,
            });
            client = res.client;
            createdClients += 1;
          } catch (err) {
            failed.push(`${row.name}: ${err.message}`);
            continue;
          }
          for (const app of row.apps) {
            try {
              await api.createApplication({ clientId: client.id, name: app });
              createdApps += 1;
            } catch (err) {
              // The client exists; only its application did not. Name both, so the
              // message says what to do rather than just what broke.
              failed.push(`${row.name} → ${app}: ${err.message}`);
            }
          }
        }

        await Promise.all([refreshCatalog(), refreshAll()]);
        if (!failed.length) {
          toast(
            `${createdClients} client${createdClients === 1 ? '' : 's'} imported${
              createdApps ? ` with ${createdApps} application${createdApps === 1 ? '' : 's'}` : ''
            }`
          );
          close();
          return;
        }
        text.value = rows
          .filter((r) => failed.some((f) => f.startsWith(`${r.name}:`) || f.startsWith(`${r.name} →`)))
          .map((r) => r.raw)
          .join('\n');
        toast(`${createdClients} imported, ${failed.length} failed`, 'err');
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
