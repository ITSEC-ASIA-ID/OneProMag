import { syncTableOverflow } from './devices.js';
import { mountContent } from './projects.js';
import { root, state } from './state.js';
import { api } from './api.js';
import { icon } from './icons.js';
import {
  confirmDialog, fmtRelative, escapeHtml as h, openModal,
  renderMarkdown, toast,
} from './ui.js';



/* ============================================================
   Information center — free-form notes per client / application
   ============================================================ */

/** Group label chips: a note may name any category; we only style known ones. */
export const INFO_TONE = {
  Credential: 'rose',
  Credentials: 'rose',
  'Common Error': 'amber',
  Errors: 'amber',
  Link: 'cyan',
  Links: 'cyan',
  'Useful Link': 'cyan',
  General: 'slate',
  Access: 'violet',
  Config: 'blue',
};


export function infoTone(category) {
  return INFO_TONE[category] || 'slate';
}


export function infoTargets() {
  const out = [];
  for (const c of state.clients) {
    out.push({ id: `client:${c.id}`, client: c, app: null, variant: null });
    for (const a of state.applications.filter((x) => Number(x.clientId) === Number(c.id))) {
      out.push({ id: `application:${a.id}`, client: c, app: a, variant: null });
      // Variants are a note target of their own: the Android build and the iOS
      // build of one application collect different findings.
      for (const v of a.variants || []) {
        out.push({ id: `variant:${v.id}`, client: c, app: a, variant: v });
      }
    }
  }
  return out;
}


export function infoSelected() {
  const [scope, id] = String(state.infoTarget || '').split(':');
  if (!scope || !id) return null;
  if (scope === 'client') {
    const client = state.clients.find((c) => Number(c.id) === Number(id));
    return client ? { scope: 'client', scopeId: Number(id), client, app: null, variant: null } : null;
  }
  if (scope === 'variant') {
    for (const a of state.applications) {
      const v = (a.variants || []).find((x) => Number(x.id) === Number(id));
      if (!v) continue;
      const owner = state.clients.find((c) => Number(c.id) === Number(a.clientId));
      return { scope: 'variant', scopeId: Number(v.id), client: owner, app: a, variant: v };
    }
    return null;
  }
  const app = state.applications.find((a) => Number(a.id) === Number(id));
  if (!app) return null;
  const owner = state.clients.find((c) => Number(c.id) === Number(app.clientId));
  return { scope: 'application', scopeId: Number(app.id), client: owner, app, variant: null };
}


/**
 * Two-pane layout: a target list on the left, the note library on the right.
 * Notes are plain Markdown-ish text rendered as paragraphs — deliberately not
 * a rich-text editor, because the point is that each application records
 * whatever shape of information its tester needs.
 */
export function infoHTML() {
  const sel = infoSelected();
  const targets = infoTargets();

  if (!targets.length) {
    return `<div class="empty">
      <div class="icon">${icon.book(28)}</div>
      <h3>No clients or applications yet</h3>
      <p>Add a client and its applications first — notes hang off them.</p>
    </div>`;
  }

  // One collapsible group per client instead of a flat list: a client with a dozen
  // applications used to push everything else out of reach, and the flat list made
  // it hard to tell which applications belonged together.
  const isActive = (t) => {
    if (!sel) return false;
    if (!t.app) return sel.scope === 'client' && Number(sel.scopeId) === Number(t.client.id);
    if (t.variant) return sel.scope === 'variant' && Number(sel.scopeId) === Number(t.variant.id);
    return sel.scope === 'application' && Number(sel.scopeId) === Number(t.app.id);
  };

  const list = state.clients
    .map((c) => {
      const apps = state.applications.filter((a) => Number(a.clientId) === Number(c.id));
      const clientTarget = targets.find((t) => !t.app && Number(t.client.id) === Number(c.id));
      const clientActive = clientTarget ? isActive(clientTarget) : false;
      // True for an application of this client AND for a variant of one, so a
      // selected variant cannot end up inside a collapsed group.
      const appActive =
        !!sel &&
        sel.scope !== 'client' &&
        !!sel.app &&
        Number(sel.app.clientId) === Number(c.id);
      // Open by default when it holds the current selection, otherwise start
      // closed — but remember an explicit open/closed choice for this session.
      const remembered = state.infoOpen?.[c.id];
      const open = remembered === undefined ? clientActive || appActive : remembered;
      const count = clientTarget ? (state.infoCounts?.[clientTarget.id] ?? 0) : 0;
      const appRows = apps
        .map((a) => {
          const act = isActive({ app: a, client: c });
          const n = state.infoCounts?.[`application:${a.id}`] ?? 0;
          const row = `<button class="info-target is-app ${act ? 'on' : ''}" data-info-target="application:${a.id}">
            <span class="it-glyph">${icon.apps(14)}</span>
            <span class="it-text"><span class="it-name" title="${h(a.name)}">${h(a.name)}</span></span>
            ${n ? `<span class="it-count">${n}</span>` : ''}
          </button>`;
          // A third level only when the application actually has variants — the
          // level is optional, and an empty "Variants" heading under every app
          // would read as broken data.
          const variantRows = (a.variants || [])
            .map((v) => {
              const vn = state.infoCounts?.[`variant:${v.id}`] ?? 0;
              return `<button class="info-target is-variant ${isActive({ app: a, client: c, variant: v }) ? 'on' : ''}"
                  data-info-target="variant:${v.id}">
                <span class="it-glyph">${icon.layers(13)}</span>
                <span class="it-text"><span class="it-name" title="${h(v.name)}">${h(v.name)}</span></span>
                ${vn ? `<span class="it-count">${vn}</span>` : ''}
              </button>`;
            })
            .join('');
          return variantRows
            ? `<div class="ig-app-block">${row}<div class="ig-variants">${variantRows}</div></div>`
            : row;
        })
        .join('');
      return `<div class="info-group ${open ? 'is-open' : ''}">
        <div class="ig-row">
          <button class="ig-toggle" data-info-toggle="${c.id}" aria-expanded="${open ? 'true' : 'false'}"
            title="${open ? 'Collapse' : 'Expand'} ${h(c.name)}">
            <span class="ig-chev">${icon.chevronDown(14)}</span>
          </button>
          <button class="info-target is-client ${clientActive ? 'on' : ''}" data-info-target="client:${c.id}">
            <span class="it-glyph">${icon.building(14)}</span>
            <span class="it-text"><span class="it-name" title="${h(c.name)}">${h(c.name)}</span></span>
            ${count ? `<span class="it-count">${count}</span>` : ''}
          </button>
        </div>
        ${apps.length ? `<div class="ig-apps">${appRows}</div>` : `<div class="ig-none">No applications</div>`}
      </div>`;
    })
    .join('');

  const head = sel
    ? `<div class="info-head">
        <div>
          <h2>${h(sel.variant ? sel.variant.name : sel.app ? sel.app.name : sel.client.name)}</h2>
          <p class="info-sub">${
            sel.variant
              ? `${icon.building(12)} ${h(sel.client?.name || '')} · ${h(sel.app?.name || '')} · sub app`
              : sel.app
                ? `${icon.building(12)} ${h(sel.client?.name || '')} · application`
                : 'Client-level notes — shared by every application below it'
          }</p>
        </div>
        <button class="btn btn-primary" data-info-new>${icon.plus()} New note</button>
      </div>`
    : `<div class="info-head">
        <div><h2>Information center</h2>
        <p class="info-sub">Pick a client, an application or a sub app on the left.</p></div>
      </div>`;

  return `<div class="info-layout">
    <aside class="info-nav">
      <div class="info-nav-label">Clients &amp; applications</div>
      <div class="info-targets">${list}</div>
    </aside>
    <section class="info-pane">
      ${head}
      <div class="info-search">
        <span class="is-glyph">${icon.search()}</span>
        <input class="input" id="info-search" placeholder="Search title, content, category…"
          autocomplete="off" aria-label="Search all notes" value="${h(state.infoQuery || '')}" />
        <button class="btn btn-sm is-clear" data-info-clear ${state.infoQuery ? '' : 'hidden'}>Clear</button>
      </div>
      ${sel && !state.infoQuery ? infoEnvHTML(sel) + infoDocsHTML(sel) : ''}
      <div id="info-entries">${
        state.infoQuery ? infoSearchHTML() : sel ? infoEntriesHTML(sel) : infoBlankHTML()
      }</div>
    </section>
  </div>`;
}


/**
 * The environment whose sheets are on screen.
 *
 * Clients have no environments, so their answer is always Dev even if an
 * application the user was just looking at left a Prod choice behind.
 */
export function currentEnv() {
  const sel = infoSelected();
  if (!sel || sel.scope === 'client') return 'Dev';
  return state.infoEnv[sel.scopeId] === 'Prod' ? 'Prod' : 'Dev';
}


/** The Dev / Prod switch above the application sheets. */
export function infoEnvHTML(sel) {
  if (sel.scope === 'client') return '';
  const env = currentEnv();
  const prod = env === 'Prod';
  return `<div class="doc-env" role="tablist" aria-label="Environment">
      <div class="doc-env-tabs">
        <button class="doc-env-tab ${prod ? '' : 'on'}" data-doc-env="Dev" role="tab"
          aria-selected="${prod ? 'false' : 'true'}">${icon.globe(13)} Dev</button>
        <button class="doc-env-tab ${prod ? 'on' : ''}" data-doc-env="Prod" role="tab"
          aria-selected="${prod ? 'true' : 'false'}">${icon.shield(13)} Prod</button>
      </div>
      <span class="doc-env-note" data-env="${env}">${
        prod
          ? 'Production sheets — separate notes and table, never mixed with Dev.'
          : 'Development sheets — the default. Production has its own page.'
      }</span>
    </div>`;
}


/**
 * The two fixed blocks every target owns: a free-text sheet and a table.
 *
 * Both render READ-ONLY until the user clicks Edit. A credentials table you can
 * clobber by mis-clicking is a support ticket waiting to happen, and read-only
 * also means the text keeps its exact indentation while browsing.
 */
export function infoDocsHTML(sel) {
  const doc = state.doc;
  const label = sel.variant ? sel.variant.name : sel.app ? sel.app.name : sel.client.name;
  const editing = state.docEditing || '';
  // The switch above says which environment is live, but a sheet is often read
  // scrolled away from it — and "Table" alone says nothing about whether these are
  // production credentials. Each block heading therefore carries the environment.
  const env = currentEnv();
  const envPill =
    sel.scope === 'client'
      ? ''
      : `<span class="doc-env-pill" data-env="${env}">${
          env === 'Prod' ? icon.shield(10) : icon.globe(10)
        }${env}</span>`;

  if (doc === undefined) {
    return `<div class="doc-block"><div class="doc-skel"><div class="skeleton"></div><div class="skeleton"></div></div></div>`;
  }

  // --- text sheet ---
  const editingText = editing === 'text';
  const textHead = `<div class="doc-head" data-env="${env}">
      <div class="doc-title">
        <span class="doc-glyph">${icon.fileText(15)}</span>
        <div>
          <h3>Notes ${envPill}</h3>
          <p class="doc-sub">Free-form notes for ${h(label)} — Markdown supported</p>
        </div>
      </div>
      <div class="doc-actions">
        ${
          editingText
            ? `<button class="btn btn-sm btn-primary" data-doc-save="text">${icon.check(13)} Save</button>
               <button class="btn btn-sm" data-doc-cancel>Cancel</button>`
            : `<button class="btn btn-sm" data-doc-edit="text">${icon.edit(13)} Edit</button>`
        }
      </div>
    </div>`;

  let textBody;
  if (editingText) {
    textBody = `<textarea class="textarea code doc-textarea" id="doc-text" rows="12"
      placeholder="Markdown. Headings, lists, **bold**, code, fenced blocks, tables and links…">${h(doc.text)}</textarea>
      <span class="hint">Markdown: <code># heading</code>, <code>- list</code>, <code>**bold**</code>,
        <code>\`code\`</code>, <code>[text](url)</code>, <code>| table |</code>. Wrap anything that must
        keep its exact alignment in a <code>\`\`\`</code> fence. Ctrl/⌘+Enter saves.</span>`;
  } else if (doc.text.trim()) {
    // Markdown, not a <pre>: the sheet is long prose and headings/lists/bold make
    // it scannable. A fenced code block keeps its exact alignment, which is what
    // the <pre> was really for.
    textBody = `<div class="doc-text doc-md">${renderMarkdown(doc.text)}</div>`;
  } else {
    textBody = `<div class="doc-empty">
      <p>Nothing written yet.</p>
      <button class="btn btn-sm" data-doc-edit="text">${icon.plus(13)} Write something</button>
    </div>`;
  }

  // --- table ---
  const editingTable = editing === 'table';
  const cols = doc.table?.columns || [];
  const rows = doc.table?.rows || [];
  const tableHead = `<div class="doc-head" data-env="${env}">
      <div class="doc-title">
        <span class="doc-glyph">${icon.tableGrid(15)}</span>
        <div>
          <h3>Table ${envPill}</h3>
          <p class="doc-sub">Grid for ${h(label)} — credentials, accounts, endpoints</p>
        </div>
      </div>
      <div class="doc-actions">
        ${
          editingTable
            ? `<button class="btn btn-sm btn-primary" data-doc-save="table">${icon.check(13)} Save</button>
               <button class="btn btn-sm" data-doc-cancel>Cancel</button>`
            : `<button class="btn btn-sm" data-doc-edit="table">${icon.edit(13)} Edit</button>`
        }
      </div>
    </div>`;

  let tableBody;
  if (editingTable) {
    tableBody = `${infoTableEditorHTML(doc.table, 'doc-table')}`;
  } else if (cols.length && rows.length) {
    tableBody = infoTableHTML({ table: doc.table });
  } else if (cols.length) {
    tableBody = `<div class="doc-empty"><p>A table with ${cols.length} column${
      cols.length === 1 ? '' : 's'
    } and no rows.</p><button class="btn btn-sm" data-doc-edit="table">${icon.edit(13)} Add rows</button></div>`;
  } else {
    tableBody = `<div class="doc-empty">
      <p>No table yet.</p>
      <button class="btn btn-sm" data-doc-edit="table">${icon.plus(13)} Build a table</button>
    </div>`;
  }

  const stamp = doc.updatedAt
    ? `<div class="doc-foot">Last edited${doc.updatedByName ? ` by ${h(doc.updatedByName)}` : ''} · ${h(
        fmtRelative(doc.updatedAt)
      )}</div>`
    : '';

  // Table first, notes below it — the short scannable block above the long prose.
  return `<section class="doc-block${editingTable ? ' is-editing' : ''}">${tableHead}<div class="doc-body" data-doc-body="table">${tableBody}</div>${stamp}</section>
    <section class="doc-block${editingText ? ' is-editing' : ''}">${textHead}<div class="doc-body">${textBody}</div></section>`;
}


export function infoBlankHTML() {
  return `<div class="empty info-empty">
    <div class="icon">${icon.book(26)}</div>
    <h3>Nothing selected</h3>
    <p>Choose a client or one of its applications to see and edit its notes.</p>
  </div>`;
}


export function infoEntriesHTML(sel) {
  const entries = state.info || [];
  // Notes are per sheet, so an empty Prod list is normal rather than lost data —
  // the message has to say which sheet it is talking about.
  const onSheet = sel.scope === 'client' ? '' : ` on the ${currentEnv()} sheet`;
  if (!entries.length) {
    return `<div class="empty info-empty">
      <div class="icon">${icon.book(26)}</div>
      <h3>No extra notes${onSheet}</h3>
      <p>Add extra notes as cards — one per topic, such as a single error, link or finding.
      They are filed on the sheet you are looking at, separately from the Notes document above.</p>
      <button class="btn btn-primary" data-info-new>${icon.plus()} Add a note</button>
    </div>`;
  }
  return `<section class="entries-block">
    <div class="entries-head">
      <h3>Extra notes <span class="entries-count">${entries.length}</span></h3>
      <span>${sel.scope === 'client' ? 'Client-wide, shared by every application' : `Filed on the ${currentEnv()} sheet`}</span>
    </div>
    <div class="info-entries">${entries.map(infoCardHTML).join('')}</div>
  </section>`;
}


/**
 * Renders one note. The body is rendered as escaped preformatted text rather
 * than parsed Markdown: no dependencies, no XSS surface, and the alignment of
 * a pasted credential block or error log survives verbatim.
 */
/**
 * Cross-client results. Each row names the client AND the application, because a
 * result without its location is useless once you have more than a few notes.
 */
export function infoSearchHTML() {
  if (state.infoSearching) {
    return `<div class="empty"><div class="icon">${icon.search(24)}</div><h3>Searching…</h3></div>`;
  }
  const results = state.infoResults || [];
  if (!results.length) {
    return `<div class="empty">
      <div class="icon">${icon.search(24)}</div>
      <h3>No notes match “${h(state.infoQuery)}”</h3>
      <p>Try a shorter word, or a value from inside a credentials table.</p>
    </div>`;
  }
  return `<div class="is-count">${results.length} note${results.length === 1 ? '' : 's'} found</div>
    <div class="is-results">${results
      .map(
        (r) => `<button class="is-row" data-info-goto="${r.id}">
          <span class="is-row-top">
            <span class="is-row-title">${h(r.title || 'Untitled note')}</span>
            <span class="ic-cat" data-tone="${infoTone(r.category)}">${h(r.category)}</span>
            ${r.kind === 'table' ? `<span class="is-kind">${icon.tableGrid(11)} table</span>` : ''}
          </span>
          <span class="is-row-where">${icon.building(11)} ${h(r.clientName || '—')}${
            r.appName ? ` · ${h(r.appName)}` : ' · client note'
          }${r.variantName ? ` · ${h(r.variantName)}` : ''}${
            r.scope === 'client'
              ? ''
              : `<span class="is-env" data-env="${r.env === 'Prod' ? 'Prod' : 'Dev'}">${
                  r.env === 'Prod' ? 'PROD' : 'DEV'
                }</span>`
          }</span>
          <span class="is-row-snip">${h(infoSnippet(r))}</span>
        </button>`
      )
      .join('')}</div>`;
}


/** The matching fragment, so a hit inside a long note is not a mystery. */
export function infoSnippet(r) {
  const q = (state.infoQuery || '').toLowerCase();
  const source =
    r.kind === 'table'
      ? [r.table?.columns || [], ...(r.table?.rows || [])].map((x) => x.join(' ')).join(' · ')
      : r.body || '';
  const text = source.replace(/\s+/g, ' ').trim();
  const at = text.toLowerCase().indexOf(q);
  if (at < 0) return text.slice(0, 120);
  const from = Math.max(0, at - 40);
  return `${from > 0 ? '…' : ''}${text.slice(from, from + 130)}`;
}


export function infoCardHTML(e) {
  return `<article class="info-card" data-entry="${e.id}">
    <div class="ic-head">
      <span class="ic-cat" data-tone="${infoTone(e.category)}">${h(e.category)}</span>
      ${
        e.scope === 'client'
          ? ''
          : `<span class="is-env ic-env" data-env="${e.env === 'Prod' ? 'Prod' : 'Dev'}">${
              e.env === 'Prod' ? 'PROD' : 'DEV'
            }</span>`
      }
      <h3 class="ic-title">${h(e.title || 'Untitled note')}</h3>
      ${e.pinned ? `<span class="ic-pin" title="Pinned">${icon.pin(13)}</span>` : ''}
      <div class="ic-actions">
        <button class="btn btn-icon" data-info-pin="${e.id}" title="${e.pinned ? 'Unpin' : 'Pin to top'}"
          aria-label="${e.pinned ? 'Unpin' : 'Pin to top'}">${icon.pin(14)}</button>
        <button class="btn btn-icon" data-info-copy="${e.id}" title="Copy body"
          aria-label="Copy note body">${icon.copy(14)}</button>
        <button class="btn btn-icon" data-info-edit="${e.id}" title="Edit"
          aria-label="Edit note">${icon.edit(14)}</button>
        <button class="btn btn-icon btn-icon-danger" data-info-del="${e.id}" title="Delete"
          aria-label="Delete note">${icon.trash(14)}</button>
      </div>
    </div>
    ${e.kind === 'table' ? infoTableHTML(e) : e.body ? `<pre class="ic-body">${h(e.body)}</pre>` : ''}
    <div class="ic-foot">
      <span>${h(e.createdByName || 'Unknown')}</span>
      <span>·</span>
      <span>${h(fmtRelative(e.updatedAt))}</span>
    </div>
  </article>`;
}


/**
 * Grid notes render as a real <table> so column alignment is done by the browser
 * rather than by counting spaces in a <pre>. Every cell is escaped, so a paste
 * containing markup stays literal.
 *
 * This is the Devices sheet, verbatim: the same `.dev-table`, the same view-mode
 * markup, the same column personalities. The inventory's first page is deliberately
 * control-free — no grip column, no per-row buttons, no `+` in the header and no
 * "Add row" row; every one of those lives behind "Edit all rows" — and the sheet
 * follows that rule exactly, with its own Edit button opening the grid editor. Two
 * tables that render the same cells but different chrome are not the same table, and
 * that difference is what a reader notices first.
 *
 * Note cards call the same function: identical look, nothing to persist, so no
 * controls either way.
 */
export function infoTableHTML(e) {
  const cols = e.table?.columns || [];
  const rows = e.table?.rows || [];
  if (!cols.length) {
    return `<div class="ic-tempty">This table has no columns yet.</div>`;
  }

  return `<div class="dev-tablewrap" data-sheet-scroll>
      <span class="dev-scrollfx left" aria-hidden="true"></span>
      <span class="dev-scrollfx right" aria-hidden="true"></span>
      <table class="dev-table ic-table">
        <thead><tr>
          ${cols
            .map(
              (c) =>
                `<th><span class="dev-h-inner"><span class="dev-h-label">${h(c)}</span></span></th>`
            )
            .join('')}
        </tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
            ${cols
              .map((_, i) => {
                const v = String(r[i] ?? '');
                if (!v.trim()) return '<td class="dev-empty-cell">—</td>';
                // Mirror the Devices sheet's column personalities, since the sheet's
                // columns are user-named and carry no type: the first column is what
                // people scan (name), the last is prose (notes), and the middle holds
                // identifiers and credentials, which are transcribed rather than read.
                if (i === 0) return `<td class="dev-name">${h(v)}</td>`;
                if (i === cols.length - 1) return `<td class="dev-notes" title="${h(v)}">${h(v)}</td>`;
                return `<td class="dev-mono-cell">${h(v)}</td>`;
              })
              .join('')}
          </tr>`
          )
          .join('')}
        </tbody>
      </table>
    </div>
    <p class="dev-scrollhint">${icon.chevronRight(12)} Scroll sideways for the remaining columns</p>`;
}


/**
 * Runs a cross-client search. Kept separate from `loadInfo` because it must not
 * touch the selected target: typing a query should never change what the left
 * list is pointing at.
 */
export async function runInfoSearch(q) {
  if (!q) {
    state.infoQuery = '';
    state.infoResults = [];
    state.infoSearching = false;
    const host = document.getElementById('info-entries');
    const sel = infoSelected();
    if (host) host.innerHTML = sel ? infoEntriesHTML(sel) : infoBlankHTML();
    const clear = document.querySelector('[data-info-clear]');
    if (clear) clear.hidden = true;
    return;
  }
  state.infoQuery = q;
  state.infoSearching = true;
  const host = document.getElementById('info-entries');
  if (host) host.innerHTML = infoSearchHTML();
  const clear = document.querySelector('[data-info-clear]');
  if (clear) clear.hidden = false;
  try {
    const res = await api.searchInfo(q);
    // Ignore a stale response if the query moved on while this was in flight.
    if (state.infoQuery !== q) return;
    state.infoResults = res.results || [];
  } catch (err) {
    if (state.infoQuery !== q) return;
    state.infoResults = [];
    toast(err.message, 'err');
  }
  state.infoSearching = false;
  if (state.infoQuery !== q) return;
  const host2 = document.getElementById('info-entries');
  if (host2) host2.innerHTML = infoSearchHTML();
  // Re-bind only the result rows; the rest of the page did not change.
  host2?.querySelectorAll('[data-info-goto]').forEach((b) =>
    b.addEventListener('click', () => openInfoResult(Number(b.dataset.infoGoto)))
  );
}


/**
 * Jumps from a search hit to the note's own page.
 * The selection lives in `state.infoTarget` as a `scope:id` string — assigning
 * anything else (an id alone) leaves the pane with no selection, which made the
 * page fall back to "Information center" with no notes.
 */
export async function openInfoResult(entryId) {
  const entry = (state.infoResults || []).find((r) => Number(r.id) === Number(entryId));
  if (!entry) return;
  state.infoTarget = `${entry.scope}:${entry.scopeId}`;
  // Persisted like any other selection, or a reload would drop the jump and land
  // on whatever target the picker last wrote.
  localStorage.setItem('opm-info-target', state.infoTarget);
  state.infoQuery = '';
  state.infoResults = [];
  // Jump to the sheet the note actually lives on. A Prod match must not land on
  // the Dev page, where the note would appear to be missing.
  if (entry.scope !== 'client') {
    state.infoEnv[entry.scopeId] = entry.env === 'Prod' ? 'Prod' : 'Dev';
  }
  await loadInfo(entry.scope, entry.scopeId, currentEnv());
  mountContent();
  document.querySelector(`[data-entry="${entry.id}"]`)?.scrollIntoView({ block: 'center' });
}


export function infoFormHTML(entry) {
  const categories = ['General', 'Credential', 'Common Error', 'Link', 'Access', 'Config'];
  const kind = entry?.kind === 'table' ? 'table' : 'text';
  return `<div class="field">
      <label for="i-title">Title</label>
      <input class="input" id="i-title" placeholder="e.g. Admin login, 500 on /transfer…"
        value="${h(entry?.title || '')}" maxlength="120" />
    </div>
    <div class="field">
      <label>Type</label>
      <input type="hidden" id="i-kind" value="${kind}" />
      <div class="segmented" data-segmented="kind" role="group" aria-label="Note type">
        <button type="button" class="seg" data-kind="text">${icon.fileText(13)} Text</button>
        <button type="button" class="seg" data-kind="table">${icon.tableGrid(13)} Table</button>
      </div>
      <span class="hint" id="i-kind-hint"></span>
    </div>
    <div class="field">
      <label for="i-cat">Category</label>
      <input class="input" id="i-cat" list="i-cat-list" placeholder="General"
        value="${h(entry?.category || 'General')}" maxlength="28" />
      <datalist id="i-cat-list">${categories.map((c) => `<option value="${c}"></option>`).join('')}</datalist>
      <span class="hint">Free text — use whatever grouping suits this application.</span>
    </div>
    <div class="field" data-kind-panel="text">
      <label for="i-body">Content</label>
      <textarea class="textarea code" id="i-body" rows="12"
        placeholder="Anything: credentials, common errors, useful links, quirks…">${h(entry?.body || '')}</textarea>
      <span class="hint">Plain text. Line breaks and indentation are kept exactly as typed.</span>
    </div>
    <div class="field" data-kind-panel="table" hidden>
      <label>Table</label>
      ${infoTableEditorHTML(entry?.table)}
      <span class="hint">Tab moves to the next cell and Enter adds a row. Drag nothing — each column header has
        its own move and delete buttons, and pasting a block of values fills downwards.</span>
    </div>`;
}


/**
 * The grid editor. Kept as plain DOM over a JS model (`readTable`/`writeTable`)
 * rather than making every cell contenteditable: re-rendering from the model on
 * each structural change means row/column insert, delete and move cannot drift
 * out of sync with what is on screen.
 */
export function infoTableEditorHTML(table, id = 'i-table') {
  const cols = table?.columns?.length ? table.columns : ['Role', 'Username', 'Password', 'Notes'];
  const rows = table?.rows?.length ? table.rows : [['', '', '', '']];
  // The starting model rides along in a data attribute: the grid itself starts
  // empty, and seeding the editor from the DOM would then read back nothing.
  return `<div class="te" id="${id}" data-init="${h(JSON.stringify({ columns: cols, rows }))}">
    <div class="te-scroll"><table class="te-grid"></table></div>
    <div class="te-actions">
      <button type="button" class="btn btn-sm" data-te-row>${icon.rowPlus(13)} Row</button>
      <button type="button" class="btn btn-sm" data-te-col>${icon.colPlus(13)} Column</button>
      <span class="te-count"></span>
    </div>
  </div>`;
}


/**
 * Reads the grid currently on screen back into `{ columns, rows }`.
 * Reading from the DOM on demand (instead of keeping a second copy in JS) means
 * there is exactly one source of truth: whatever the user can see.
 */
export function readTable(root) {
  const grid = root.querySelector('.te-grid');
  if (!grid) return { columns: [], rows: [] };
  const headCells = [...grid.querySelectorAll('thead th input')];
  const columns = headCells.map((i) => i.value);

  if (grid.dataset.model) {
    // A move/delete was applied to the model but not yet to the DOM? No — the DOM
    // is always re-rendered after those, so this branch stays unreachable. Kept
    // explicit so the invariant is obvious.
  }

  const rows = [...grid.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td[data-cell] input')].map((i) => i.value)
  );
  return { columns, rows };
}


/** Paints the editor table from a model, wiring every control it renders. */
export function writeTable(root, model, opts = {}) {
  const grid = root.querySelector('.te-grid');
  const cols = model.columns || [];
  const rows = model.rows || [];
  const focus = opts.focus;

  grid.innerHTML = `<thead><tr>${cols
    .map(
      (c, ci) => `<th data-colhead="${ci}" draggable="true">
        <div class="te-th">
          <button type="button" class="te-grip" data-col-drag="${ci}" draggable="false"
            title="Drag to move this column" aria-label="Drag to move column ${ci + 1}">${icon.grip(12)}</button>
          <input class="te-cinput" value="${h(c)}" placeholder="Column" maxlength="60"
            data-col="${ci}" aria-label="Column ${ci + 1} name" />
          <div class="te-th-acts">
            <button type="button" class="te-mini" data-col-move="-1" data-ci="${ci}"
              title="Move column left" aria-label="Move column left" ${ci === 0 ? 'disabled' : ''}>${icon.arrowLeft(12)}</button>
            <button type="button" class="te-mini" data-col-move="1" data-ci="${ci}"
              title="Move column right" aria-label="Move column right" ${ci === cols.length - 1 ? 'disabled' : ''}>${icon.arrowRight(12)}</button>
            <button type="button" class="te-mini te-mini-danger" data-col-del="${ci}"
              title="Delete column" aria-label="Delete column" ${cols.length <= 1 ? 'disabled' : ''}>${icon.x(12)}</button>
          </div>
        </div>
      </th>`
    )
    .join('')}<th class="te-th-row"></th></tr></thead>
    <tbody>${rows
      .map(
        (r, ri) => `<tr>
        ${cols
          .map(
            (_, ci) => `<td data-cell="${ci}"><input class="te-input" value="${h(r[ci] ?? '')}"
              data-r="${ri}" data-c="${ci}" aria-label="Row ${ri + 1} column ${ci + 1}" /></td>`
          )
          .join('')}
        <td class="te-rowacts">
          <button type="button" class="te-mini" data-row-move="-1" data-ri="${ri}"
            title="Move row up" aria-label="Move row up" ${ri === 0 ? 'disabled' : ''}>${icon.arrowUp(12)}</button>
          <button type="button" class="te-mini" data-row-move="1" data-ri="${ri}"
            title="Move row down" aria-label="Move row down" ${ri === rows.length - 1 ? 'disabled' : ''}>${icon.arrowDown(12)}</button>
          <button type="button" class="te-mini te-mini-danger" data-row-del="${ri}"
            title="Delete row" aria-label="Delete row" ${rows.length <= 1 ? 'disabled' : ''}>${icon.x(12)}</button>
        </td>
      </tr>`
      )
      .join('')}</tbody>`;

  const count = root.querySelector('.te-count');
  if (count) count.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'} · ${cols.length} column${cols.length === 1 ? '' : 's'}`;

  if (focus) {
    const target = grid.querySelector(focus);
    if (target) {
      target.focus();
      if (target.select) target.select();
    }
  }
}


/** Wires every control inside one table editor. Called once per mounted editor. */
export function bindTableEditor(root) {
  const grid = root.querySelector('.te-grid');
  if (!grid) return;

  const rebuild = (model, focus) => {
    writeTable(root, model, { focus });
    // The editor lives inside a modal that owns the type switch; ask it to
    // repaint so the hint/segmented state stays correct after a structural edit.
    root.closest('.modal')?._syncKind?.();
  };

  // Structural changes are delegated so they survive every re-render.
  root.addEventListener('click', (ev) => {
    const model = readTable(root);

    const rowMove = ev.target.closest('[data-row-move]');
    if (rowMove) {
      const ri = Number(rowMove.dataset.ri);
      const dir = Number(rowMove.dataset.rowMove);
      const to = ri + dir;
      if (to < 0 || to >= model.rows.length) return;
      [model.rows[ri], model.rows[to]] = [model.rows[to], model.rows[ri]];
      rebuild(model, `[data-r="${to}"][data-c="0"]`);
      return;
    }

    const rowDel = ev.target.closest('[data-row-del]');
    if (rowDel) {
      const ri = Number(rowDel.dataset.rowDel);
      if (model.rows.length <= 1) return;
      model.rows.splice(ri, 1);
      rebuild(model, `[data-r="${Math.min(ri, model.rows.length - 1)}"][data-c="0"]`);
      return;
    }

    const colMove = ev.target.closest('[data-col-move]');
    if (colMove) {
      const ci = Number(colMove.dataset.ci);
      const dir = Number(colMove.dataset.colMove);
      const to = ci + dir;
      if (to < 0 || to >= model.columns.length) return;
      [model.columns[ci], model.columns[to]] = [model.columns[to], model.columns[ci]];
      // Move the whole column of cells with the header, or the data would stay
      // behind and silently reassign itself to a different label.
      model.rows = model.rows.map((r) => {
        const copy = r.slice();
        [copy[ci], copy[to]] = [copy[to], copy[ci]];
        return copy;
      });
      rebuild(model, `[data-col="${to}"]`);
      return;
    }

    const colDel = ev.target.closest('[data-col-del]');
    if (colDel) {
      const ci = Number(colDel.dataset.colDel);
      if (model.columns.length <= 1) return;
      model.columns.splice(ci, 1);
      model.rows = model.rows.map((r) => r.filter((_, i) => i !== ci));
      rebuild(model, `[data-col="${Math.min(ci, model.columns.length - 1)}"]`);
      return;
    }

    if (ev.target.closest('[data-te-row]')) {
      model.rows.push(model.columns.map(() => ''));
      rebuild(model, `[data-r="${model.rows.length - 1}"][data-c="0"]`);
      return;
    }

    if (ev.target.closest('[data-te-col]')) {
      model.columns.push(`Column ${model.columns.length + 1}`);
      model.rows = model.rows.map((r) => [...r, '']);
      rebuild(model, `[data-col="${model.columns.length - 1}"]`);
    }
  });

  // ---- drag to reorder columns ----
  // The model is the single source of truth: dragging rewrites column order and
  // rotates every row's cells with it, then the table repaints. Native HTML5 DnD
  // is used rather than pointer events so the drag image and autoscroll come for
  // free; the arrow buttons stay as the keyboard/pointer fallback.
  let dragFrom = -1;
  const clearMarks = () => {
    grid.querySelectorAll('.is-drop-before, .is-drop-after, .is-dragging').forEach((el) =>
      el.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging')
    );
  };

  const moveColumn = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    const model = readTable(root);
    if (from >= model.columns.length || to >= model.columns.length) return;
    const [col] = model.columns.splice(from, 1);
    model.columns.splice(to, 0, col);
    // Rotate the cells with their header, or the data silently re-labels itself.
    model.rows = model.rows.map((r) => {
      const copy = r.slice();
      const [cell] = copy.splice(from, 1);
      copy.splice(to, 0, cell);
      return copy;
    });
    rebuild(model, `[data-col="${to}"]`);
  };

  grid.addEventListener('dragstart', (ev) => {
    const th = ev.target.closest('th[data-colhead]');
    if (!th) {
      ev.preventDefault();
      return;
    }
    dragFrom = Number(th.dataset.colhead);
    th.classList.add('is-dragging');
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      // Firefox refuses to start a drag without payload.
      ev.dataTransfer.setData('text/plain', String(dragFrom));
    }
  });

  grid.addEventListener('dragover', (ev) => {
    const th = ev.target.closest('th[data-colhead]');
    if (!th || dragFrom < 0) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    const rect = th.getBoundingClientRect();
    const after = ev.clientX > rect.left + rect.width / 2;
    clearMarks();
    // clearMarks() strips every marker including the drag source's, so re-apply.
    grid.querySelector(`th[data-colhead="${dragFrom}"]`)?.classList.add('is-dragging');
    th.classList.add(after ? 'is-drop-after' : 'is-drop-before');
  });

  grid.addEventListener('drop', (ev) => {
    const th = ev.target.closest('th[data-colhead]');
    if (!th || dragFrom < 0) return;
    ev.preventDefault();
    const target = Number(th.dataset.colhead);
    const rect = th.getBoundingClientRect();
    const after = ev.clientX > rect.left + rect.width / 2;
    // Resolve in two steps: first the insertion slot in the ORIGINAL array,
    // then shift it down by one if the dragged column sat to its left and has
    // already been lifted out. Doing it in one step is where off-by-one bugs live.
    const slot = after ? target + 1 : target;
    const to = slot > dragFrom ? slot - 1 : slot;
    const from = dragFrom;
    dragFrom = -1;
    clearMarks();
    moveColumn(from, to);
  });

  grid.addEventListener('dragend', () => {
    dragFrom = -1;
    clearMarks();
  });

  // Enter adds a row below the current one and lands there — the fastest path for
  // typing a credentials list top to bottom.
  grid.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || !ev.target.matches('[data-cell] input')) return;
    ev.preventDefault();
    const model = readTable(root);
    const ri = Number(ev.target.dataset.r);
    const ci = Number(ev.target.dataset.c);
    model.rows.splice(ri + 1, 0, model.columns.map(() => ''));
    rebuild(model, `[data-r="${ri + 1}"][data-c="${ci}"]`);
  });

  // Pasting a multi-line block fills downwards from the focused cell, which is
  // how a credentials dump actually arrives.
  grid.addEventListener('paste', (ev) => {
    const cell = ev.target.closest('[data-cell] input');
    if (!cell) return;
    const text = ev.clipboardData?.getData('text') || '';
    if (!/\t|\r?\n/.test(text)) return; // single value: let the browser paste it
    ev.preventDefault();
    const model = readTable(root);
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
    const startR = Number(cell.dataset.r);
    const startC = Number(cell.dataset.c);
    lines.forEach((line, li) => {
      const cells = line.split('\t');
      const ri = startR + li;
      while (model.rows.length <= ri) model.rows.push(model.columns.map(() => ''));
      cells.forEach((val, ci2) => {
        const c = startC + ci2;
        while (model.columns.length <= c) {
          model.columns.push(`Column ${model.columns.length + 1}`);
          model.rows.forEach((r) => r.push(''));
        }
        model.rows[ri][c] = val;
      });
    });
    rebuild(model, `[data-r="${startR}"][data-c="${startC}"]`);
  });

  // Tab: the browser already moves to the next input in DOM order, which is the
  // natural left-to-right/top-to-bottom order inside the grid. Shift+Tab from the
  // very first cell would otherwise escape into the modal chrome, so wrap it.
  grid.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab' || ev.shiftKey) return;
    const inputs = [...grid.querySelectorAll('tbody input[data-cell]')];
    if (ev.target !== inputs[inputs.length - 1]) return;
    ev.preventDefault();
    const model = readTable(root);
    model.rows.push(model.columns.map(() => ''));
    rebuild(model, `[data-r="${model.rows.length - 1}"][data-c="0"]`);
  });

  // Seed from the embedded model on first mount; afterwards the DOM is the truth.
  const seeded = readTable(root);
  if (!seeded.columns.length) {
    let init = { columns: [], rows: [] };
    try {
      init = JSON.parse(root.dataset.init || '{}');
    } catch {
      init = { columns: [], rows: [] };
    }
    const columns = Array.isArray(init.columns) && init.columns.length ? init.columns : ['Column 1'];
    const rows = (Array.isArray(init.rows) && init.rows.length ? init.rows : [columns.map(() => '')]).map(
      (r) => columns.map((_, i) => String((Array.isArray(r) ? r[i] : '') ?? ''))
    );
    writeTable(root, { columns, rows });
  } else {
    writeTable(root, seeded);
  }
  root.dataset.init = '';
}


export function openInfoForm(entry = null) {
  const sel = infoSelected();
  if (!sel) return;
  const editing = Boolean(entry);
  openModal({
    title: editing ? 'Edit note' : 'New note',
    // Naming the sheet matters: the same application has separate Dev and Prod
    // note lists, and "which one am I adding to" is otherwise invisible here.
    subtitle: sel.app
      ? `${sel.variant ? `${sel.variant.name} — ` : ''}${sel.app.name} — ${
          sel.client?.name || ''
        } · ${editing ? entry.env || 'Dev' : currentEnv()} sheet`
      : sel.client?.name,
    wide: true,
    body: infoFormHTML(entry),
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Add note'}</button>`,
    initialFocus: '#i-title',
    onMount: (modal, close) => {
      const save = modal.querySelector('[data-save]');
      modal.querySelector('[data-cancel]').addEventListener('click', close);

      const kindInput = modal.querySelector('#i-kind');
      const kindHint = modal.querySelector('#i-kind-hint');
      const segments = [...modal.querySelectorAll('[data-kind]')];
      const panels = [...modal.querySelectorAll('[data-kind-panel]')];

      // `syncKind` is re-run by the table editor on every structural change, so it
      // is defined once here and exposed on the modal rather than duplicated.
      function syncKind() {
        const kind = kindInput.value === 'table' ? 'table' : 'text';
        segments.forEach((b) => {
          const on = b.dataset.kind === kind;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        panels.forEach((p) => (p.hidden = p.dataset.kindPanel !== kind));
        if (kindHint) {
          kindHint.textContent =
            kind === 'table'
              ? 'A grid — good for credentials or anything with repeating columns.'
              : 'Free-form text — good for notes, links and error logs.';
        }
      }
      modal._syncKind = syncKind;
      syncKind();

      segments.forEach((b) =>
        b.addEventListener('click', () => {
          kindInput.value = b.dataset.kind;
          syncKind();
        })
      );

      const editor = modal.querySelector('#i-table');
      if (editor) bindTableEditor(editor);

      const submit = async () => {
        const kind = kindInput.value === 'table' ? 'table' : 'text';
        const payload = {
          title: modal.querySelector('#i-title').value.trim(),
          category: modal.querySelector('#i-cat').value.trim() || 'General',
          kind,
        };
        // Editing keeps the note on the sheet it already belongs to. The form has
        // no environment control, so without this a Prod note opened while the
        // page was on Dev would be silently re-filed into Dev on save.
        if (editing) payload.env = entry.env || 'Dev';
        if (kind === 'table') {
          const model = readTable(modal.querySelector('#i-table'));
          if (!model.columns.length) {
            toast('Add at least one column', 'err');
            return;
          }
          payload.table = model;
          payload.body = '';
        } else {
          payload.body = modal.querySelector('#i-body').value;
          payload.table = { columns: [], rows: [] };
        }
        if (kind === 'text' && !payload.title && !payload.body.trim()) {
          toast('Give the note a title or some content', 'err');
          modal.querySelector('#i-title').focus();
          return;
        }
        if (kind === 'table' && !payload.title) {
          toast('Give the table a title', 'err');
          modal.querySelector('#i-title').focus();
          return;
        }
        save.disabled = true;
        try {
          if (editing) await api.updateInfo(entry.id, payload);
          else
            await api.createInfo({
              scope: sel.scope,
              scopeId: sel.scopeId,
              // The note belongs to the sheet it was written on, so a Prod note
              // is never visible from the Dev page.
              env: sel.scope === 'client' ? 'Dev' : currentEnv(),
              ...payload,
            });
          close();
          toast(editing ? 'Note updated' : 'Note added', 'ok');
          await loadInfo(sel.scope, sel.scopeId, currentEnv());
          await refreshInfoCounts();
          // Repaint: without this the list kept showing the pre-save cards
          // (state.info was fresh but nothing re-rendered it), so a new note
          // appeared to be missing until the next navigation.
          mountContent();
        } catch (err) {
          toast(err.message, 'err');
          save.disabled = false;
        }
      };
      save.addEventListener('click', submit);
      modal.querySelector('#i-body').addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
      });
      // Ctrl/Cmd+Enter from inside the grid saves too, so the shortcut does not
      // depend on which panel happens to be visible.
      modal.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
      });
    },
  });
}


/** Entry point for the Information center: restore the last target, load it. */
export async function loadInfoPage() {
  if (!infoSelected()) state.infoTarget = '';
  localStorage.setItem('opm-info-target', state.infoTarget || '');
  const sel = infoSelected();
  if (!sel) {
    state.info = [];
    mountContent();
    await refreshInfoCounts();
    if (state.nav === 'info') mountContent();
    return;
  }
  mountContent();
  await loadInfo(sel.scope, sel.scopeId, currentEnv());
  await refreshInfoCounts();
  if (state.nav === 'info') mountContent();
}


export async function loadInfo(scope, scopeId, env = 'Dev') {
  try {
    // Both halves in flight together: the notes list and the fixed document are
    // always shown side by side, so loading them in sequence would double the
    // perceived wait for no reason.
    const [res, docRes] = await Promise.all([
      api.info(scope, scopeId, env),
      api.doc(scope, scopeId, env),
    ]);
    state.info = res.entries;
    state.doc = docRes.doc;
    state.docEnv = env;
  } catch (err) {
    toast(err.message, 'err');
    state.info = [];
    state.doc = undefined;
  }
}


/**
 * Saves one half of the fixed document. Only the field being edited is sent, so
 * saving the table can never blank the text (and vice versa).
 */
export async function saveDoc(part) {
  const sel = infoSelected();
  if (!sel) return;
  const payload = {};
  if (part === 'text') {
    payload.text = document.getElementById('doc-text')?.value ?? '';
  } else {
    const editor = document.getElementById('doc-table');
    if (!editor) return;
    const model = readTable(editor);
    if (!model.columns.length) {
      toast('A table needs at least one column', 'err');
      return;
    }
    payload.table = model;
  }
  try {
    const res = await api.saveDoc(sel.scope, sel.scopeId, payload, currentEnv());
    state.doc = res.doc;
    state.docEditing = '';
    toast(part === 'text' ? 'Notes saved' : 'Table saved', 'ok');
    mountContent();
  } catch (err) {
    toast(err.message, 'err');
  }
}


/**
 * Note counts beside every target. One request per target would be N+1 on a
 * client list, but this page renders once and the counts are cheap; keeping
 * them here means the sidebar list can show "3" without opening each target.
 */
export async function refreshInfoCounts() {
  const targets = infoTargets();
  const counts = {};
  await Promise.all(
    targets.map(async (t) => {
      const [scope, id] = t.id.split(':');
      try {
        const res = await api.info(scope, Number(id), 'Dev');
        if (res.entries.length) counts[t.id] = res.entries.length;
      } catch {
        /* a target that vanished mid-render simply has no count */
      }
    })
  );
  state.infoCounts = counts;
}


export function bindDocs() {
  document.querySelectorAll('[data-doc-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      state.docEditing = b.dataset.docEdit;
      mountContent();
      // Land the caret in the editor: clicking Edit then having to click again
      // into the field is the kind of friction that reads as "nothing happened".
      const field = b.dataset.docEdit === 'text' ? document.getElementById('doc-text') : null;
      if (field) {
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      }
    })
  );

  document.querySelectorAll('[data-doc-cancel]').forEach((b) =>
    b.addEventListener('click', () => {
      state.docEditing = '';
      mountContent();
    })
  );

  document.querySelectorAll('[data-doc-save]').forEach((b) =>
    b.addEventListener('click', () => saveDoc(b.dataset.docSave))
  );

  const textarea = document.getElementById('doc-text');
  if (textarea) {
    textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveDoc('text');
      if (e.key === 'Escape') {
        state.docEditing = '';
        mountContent();
      }
    });
    // Leave the editor without saving when the text did not change, so a stray
    // click cannot silently discard what was typed.
    textarea.addEventListener('blur', () => {
      if (state.docEditing !== 'text') return;
      if (document.activeElement?.closest?.('.doc-block')) return;
    });
  }

  const editor = document.getElementById('doc-table');
  if (editor) {
    bindTableEditor(editor);
    editor.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveDoc('table');
    });
  }

  // The rendered (non-editing) sheet is the Devices table, so it owns the same
  // overflow cue. Nothing else to wire: its controls live in the editor behind
  // "Edit", exactly as the inventory's live behind "Edit all rows".
  if (!state.docEditing) syncSheetOverflow();
}


export function bindInfo() {
  // Collapse/expand a client group. Kept separate from the target buttons so
  // toggling never navigates away from what the user is reading.
  document.querySelectorAll('[data-info-toggle]').forEach((b) =>
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = Number(b.dataset.infoToggle);
      const group = b.closest('.info-group');
      const open = !group.classList.contains('is-open');
      group.classList.toggle('is-open', open);
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      b.title = `${open ? 'Collapse' : 'Expand'} ${group.querySelector('.it-name')?.textContent || ''}`;
      state.infoOpen[id] = open;
    })
  );
  document.querySelectorAll('[data-info-target]').forEach((b) =>
    b.addEventListener('click', async () => {
      state.infoTarget = b.dataset.infoTarget;
      localStorage.setItem('opm-info-target', state.infoTarget);
      const sel = infoSelected();
      if (!sel) return;
      state.info = [];
      // Opening the group whenever its client (or one of its apps, or a variant of
      // one of those) is selected keeps the active row visible: without this a
      // remembered "closed" could hide the very thing the user just clicked.
      if (sel.client) state.infoOpen[sel.client.id] = true;
      // Show the skeleton while the new target's document loads.
      state.doc = undefined;
      state.docEditing = '';
      document.querySelectorAll('[data-info-target]').forEach((x) =>
        x.classList.toggle('on', x.dataset.infoTarget === b.dataset.infoTarget)
      );
      // Read the env AFTER state.infoTarget is set: a client target resolves to Dev
      // even when the previous application was showing Prod.
      await loadInfo(sel.scope, sel.scopeId, currentEnv());
      mountContent();
    })
  );
  // Dev / Prod switch on an application's sheets.
  document.querySelectorAll('[data-doc-env]').forEach((b) =>
    b.addEventListener('click', async () => {
      const sel = infoSelected();
      if (!sel) return;
      const next = b.dataset.docEnv === 'Prod' ? 'Prod' : 'Dev';
      if (next === currentEnv()) return;
      state.infoEnv[sel.scopeId] = next;
      // An unsaved edit belongs to the sheet it was started on, so switching pages
      // drops it rather than silently saving Dev text into the Prod sheet.
      state.docEditing = '';
      state.doc = undefined;
      await loadInfo(sel.scope, sel.scopeId, next);
      mountContent();
    })
  );
  document.querySelectorAll('[data-info-new]').forEach((b) =>
    b.addEventListener('click', () => openInfoForm())
  );
  document.querySelectorAll('[data-info-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openInfoForm(state.info.find((e) => Number(e.id) === Number(b.dataset.infoEdit)))
    )
  );
  document.querySelectorAll('[data-info-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const entry = state.info.find((e) => Number(e.id) === Number(b.dataset.infoDel));
      if (!entry) return;
      const ok = await confirmDialog({
        title: 'Delete this note?',
        message: `“${entry.title || 'Untitled note'}” will be removed for everyone.`,
        confirmLabel: 'Delete note',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteInfo(entry.id);
        toast('Note deleted', 'ok');
        const sel = infoSelected();
        if (sel) await loadInfo(sel.scope, sel.scopeId, currentEnv());
        await refreshInfoCounts();
        mountContent();
      } catch (err) {
        toast(err.message, 'err');
      }
    })
  );
  document.querySelectorAll('[data-info-pin]').forEach((b) =>
    b.addEventListener('click', async () => {
      const entry = state.info.find((e) => Number(e.id) === Number(b.dataset.infoPin));
      if (!entry) return;
      try {
        await api.updateInfo(entry.id, { pinned: !entry.pinned });
        const sel = infoSelected();
        if (sel) await loadInfo(sel.scope, sel.scopeId, currentEnv());
        await refreshInfoCounts();
        mountContent();
      } catch (err) {
        toast(err.message, 'err');
      }
    })
  );
  const searchInput = document.getElementById('info-search');
  if (searchInput) {
    let timer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      const q = searchInput.value.trim();
      timer = setTimeout(() => runInfoSearch(q), 240);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        runInfoSearch('');
      }
    });
  }

  const clearBtn = document.querySelector('[data-info-clear]');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const input = document.getElementById('info-search');
      if (input) input.value = '';
      runInfoSearch('');
      input?.focus();
    });
  }

  document.querySelectorAll('[data-info-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const entry = state.info.find((e) => Number(e.id) === Number(b.dataset.infoCopy));
      if (!entry) return;
      // A table has no body to copy, so serialise it as tab-separated text — which
      // pastes straight back into a spreadsheet or another grid note.
      const text =
        entry.kind === 'table'
          ? [entry.table?.columns || [], ...(entry.table?.rows || [])]
              .map((r) => r.join('\t'))
              .join('\n')
          : entry.body;
      try {
        await navigator.clipboard.writeText(text);
        toast(entry.kind === 'table' ? 'Table copied as text' : 'Note copied', 'ok');
      } catch {
        toast('Could not copy — select the text manually', 'err');
      }
    })
  );
}


/** The Information center's copy of that call. Same function, different wrapper.
 *
 * Scoped to the fixed Table block: a note card renders the same `.dev-tablewrap`, so
 * a bare `[data-sheet-scroll]` query would sometimes measure a card instead — and a
 * card has no hint of its own to reveal. */
export function syncSheetOverflow() {
  syncTableOverflow(document.querySelector('[data-doc-body="table"] [data-sheet-scroll]'));
}
