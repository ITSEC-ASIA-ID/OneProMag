import { editStamp } from '../shared.js';
import { db } from '../db.js';
import { HttpError, nowISO } from '../auth.js';


/**
 * Where a note or a sheet can hang: a client, an application, or one variant of an
 * application. Defined once so a new level cannot be half-supported.
 */
const INFO_SCOPES = new Set(['client', 'application', 'variant']);


function assertInfoScope(scope) {
  if (!INFO_SCOPES.has(scope)) {
    throw new HttpError(400, "Scope must be 'client', 'application' or 'variant'");
  }
}


/**
 * A note can only hang off a target that really exists; without this a typo'd
 * scopeId would silently create orphan notes nothing links to.
 */
async function assertScopeExists(scope, scopeId) {
  const table =
    scope === 'client' ? 'clients' : scope === 'variant' ? 'application_variants' : 'applications';
  const row = await db.get(`SELECT id FROM ${table} WHERE id = ?`, [scopeId]);
  if (!row) {
    throw new HttpError(
      404,
      scope === 'client'
        ? 'Client not found'
        : scope === 'variant'
          ? 'Variant app not found'
          : 'Application not found'
    );
  }
}


/**
 * Reads the fixed document for a target. `undefined` means "no row yet"; callers
 * always want a usable shape, so a missing row comes back as an empty document
 * rather than a 404 — the page should just show an empty editor.
 */
/**
 * The environment a document request is about. Clients have no environments — a
 * client is an organisation, not a deployment — so anything but Dev is refused
 * there rather than silently written to a row nobody will open.
 */
function documentEnv(scope, raw) {
  const env = String(raw || 'Dev');
  if (env !== 'Dev' && env !== 'Prod') {
    throw new HttpError(400, "Environment must be 'Dev' or 'Prod'");
  }
  if (scope === 'client' && env !== 'Dev') {
    throw new HttpError(400, 'Only applications and their variants have a production environment');
  }
  return env;
}


async function readDocument(scope, scopeId, env = 'Dev') {
  const row = await db.get(
    `SELECT d.text_body, d.table_json, d.updated_at, u.name AS updated_by_name
       FROM documents d LEFT JOIN users u ON u.id = d.updated_by
      WHERE d.scope = ? AND d.scope_id = ? AND d.env = ?`,
    [scope, scopeId, env]
  );
  return {
    scope,
    scopeId,
    env,
    text: row?.text_body || '',
    tableJson: row?.table_json || '',
    table: parseTable(row?.table_json || ''),
    updatedAt: row?.updated_at || '',
    updatedByName: row?.updated_by_name || '',
  };
}


/**
 * Bounds the grid so one note cannot become a multi-megabyte row: 40 columns and
 * 500 rows is far more than a credentials table ever needs, and the cell text is
 * capped so a pasted log cannot bloat the payload.
 */
function serialiseTable(table) {
  const rawCols = Array.isArray(table?.columns) ? table.columns : [];
  const columns = rawCols.slice(0, 40).map((c) => String(c ?? '').slice(0, 120));
  const rows = (Array.isArray(table?.rows) ? table.rows : []).slice(0, 500).map((r) =>
    columns.map((_, i) => String((Array.isArray(r) ? r[i] : '') ?? '').slice(0, 2000))
  );
  // Every row is padded/truncated to the column count here, so the client never
  // has to defend against ragged arrays.
  return JSON.stringify({ columns, rows });
}


/**
 * Normalises a stored table payload into `{ columns, rows }`.
 * Anything unexpected falls back to a blank grid — a note written by an older
 * build (or hand-edited in the DB) must never take the page down.
 */
function parseTable(raw) {
  if (!raw) return { columns: [], rows: [] };
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const columns = Array.isArray(v?.columns) ? v.columns.map((c) => String(c ?? '')) : [];
    const rows = Array.isArray(v?.rows)
      ? v.rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []))
      : [];
    return { columns, rows };
  } catch {
    return { columns: [], rows: [] };
  }
}


/**
 * One note entry in the information library.
 * `scope`/`scopeId` say whether this belongs to a client or to an application.
 */
function shapeInfoEntry(row) {
  return {
    id: row.id,
    scope: row.scope,
    scopeId: Number(row.scope_id),
    title: row.title || '',
    body: row.body || '',
    category: row.category || 'General',
    kind: row.kind === 'table' ? 'table' : 'text',
    // Which sheet the note lives on. Client notes are always Dev: a client has
    // no production page to attach to.
    env: row.env === 'Prod' ? 'Prod' : 'Dev',
    // Parsed lazily: a malformed grid must not break the whole page, so a bad
    // payload degrades to an empty table rather than a 500.
    table: parseTable(row.data),
    pinned: Boolean(Number(row.pinned ?? 0)),
    createdBy: row.created_by == null ? null : Number(row.created_by),
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}


/**
 * Every note visible on one client/application page for one environment,
 * pinned first. `env` is part of the filter rather than something the caller
 * sorts out afterwards, so a Dev note can never leak onto the Prod sheet.
 */
async function infoEntriesFor(scope, scopeId, env = 'Dev') {
  const rows = await db.all(
    `SELECT e.*, u.name AS created_by_name
       FROM info_entries e
       LEFT JOIN users u ON u.id = e.created_by
      WHERE e.scope = ? AND e.scope_id = ? AND e.env = ?
      ORDER BY e.pinned DESC, e.updated_at DESC, e.id DESC`,
    [scope, scopeId, documentEnv(scope, env)]
  );
  return rows.map(shapeInfoEntry);
}


/* ============================================================
   routes
   ============================================================ */
export const routes = {

  // ---------------- information library ----------------
  // Free-form notes attached to a client or to an application. The body is a
  // plain-text Markdown document with NO fixed schema: every client records
  // different things (credentials, common errors, useful links, quirks), so
  // forcing them into "credential" and "common_error" columns would lose half
  // of it. `category` is a free label used only for grouping and filtering.

  /**
   * Searches every note the caller can see. Notes are spread across clients and
   * applications, so without this the only way to reach a credential is to
   * remember which application it was filed under.
   */
  'GET /api/info/search': async (ctx) => {
    const q = String(ctx.query.q || '').trim();
    if (q.length < 2) return { results: [], total: 0 };
    // LOWER() on both sides keeps this case-insensitive on SQLite as well as
    // Postgres, where LIKE is case-sensitive by default.
    const like = `%${q.toLowerCase()}%`;
    const rows = await db.all(
      `SELECT e.*, u.name AS created_by_name,
              c.name AS client_name,
              a.name AS app_name,
              a.client_id AS app_client_id,
              ac.name AS app_client_name,
              v.name AS variant_name
         FROM info_entries e
         LEFT JOIN users u ON u.id = e.created_by
         LEFT JOIN clients c ON e.scope = 'client' AND c.id = e.scope_id
         LEFT JOIN application_variants v ON e.scope = 'variant' AND v.id = e.scope_id
         -- One join for both note kinds: a variant note is filed under the
         -- application that owns the variant, so it prints with the same
         -- "Client / Application" breadcrumb as an application note.
         LEFT JOIN applications a
                ON (e.scope = 'application' AND a.id = e.scope_id)
                OR (e.scope = 'variant' AND a.id = v.application_id)
         LEFT JOIN clients ac ON ac.id = a.client_id
        WHERE LOWER(e.title) LIKE ?
           OR LOWER(e.body) LIKE ?
           OR LOWER(e.category) LIKE ?
           OR LOWER(e.data) LIKE ?
        ORDER BY e.updated_at DESC
        LIMIT 60`,
      [like, like, like, like]
    );
    const results = rows.map((row) => {
      const entry = shapeInfoEntry(row);
      return {
        ...entry,
        clientId:
          entry.scope === 'client'
            ? entry.scopeId
            : (row.app_client_id == null ? null : Number(row.app_client_id)),
        clientName: entry.scope === 'client' ? row.client_name || '' : row.app_client_name || '',
        appName: entry.scope === 'client' ? '' : row.app_name || '',
        variantName: entry.scope === 'variant' ? row.variant_name || '' : '',
      };
    });
    return { results, total: results.length };
  },


  'GET /api/info': async (ctx) => {
    const scope = String(ctx.query.scope || '');
    const scopeId = Number(ctx.query.scopeId);
    assertInfoScope(scope);
    if (!scopeId) throw new HttpError(400, 'scopeId is required');
    await assertScopeExists(scope, scopeId);
    const env = documentEnv(scope, ctx.query.env);
    return { entries: await infoEntriesFor(scope, scopeId, env), env };
  },


  /**
   * The two fixed documents every client and application owns: one free-text
   * sheet and one table. They are created lazily on first read, so a target
   * always reports the same shape and the UI never has to invent a placeholder.
   */
  'GET /api/docs/:scope/:scopeId': async (ctx) => {
    const scope = String(ctx.params.scope || '');
    const scopeId = Number(ctx.params.scopeId);
    assertInfoScope(scope);
    if (!scopeId) throw new HttpError(400, 'scopeId is required');
    await assertScopeExists(scope, scopeId);
    const env = documentEnv(scope, ctx.query.env);
    return { doc: await readDocument(scope, scopeId, env) };
  },


  'PATCH /api/docs/:scope/:scopeId': async (ctx) => {
    const scope = String(ctx.params.scope || '');
    const scopeId = Number(ctx.params.scopeId);
    assertInfoScope(scope);
    if (!scopeId) throw new HttpError(400, 'scopeId is required');
    await assertScopeExists(scope, scopeId);

    const env = documentEnv(scope, ctx.body?.env ?? ctx.query.env);
    const current = await readDocument(scope, scopeId, env);
    const body = ctx.body || {};
    // Partial updates: the text editor and the table editor save separately and
    // must never blank the other half of the document.
    const nextText = body.text !== undefined ? String(body.text) : current.text;
    const nextTable = body.table !== undefined ? serialiseTable(body.table) : current.tableJson;

    await db.run(
      `INSERT INTO documents (scope, scope_id, env, text_body, table_json, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (scope, scope_id, env) DO UPDATE SET
         text_body = excluded.text_body,
         table_json = excluded.table_json,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
      [scope, scopeId, env, nextText, nextTable, ctx.user.id, nowISO()]
    );
    return { doc: await readDocument(scope, scopeId, env) };
  },


  'POST /api/info': async (ctx) => {
    const body = ctx.body || {};
    const scope = String(body.scope || '');
    const scopeId = Number(body.scopeId);
    assertInfoScope(scope);
    if (!scopeId) throw new HttpError(400, 'scopeId is required');
    await assertScopeExists(scope, scopeId);
    const env = documentEnv(scope, body.env);
    const title = String(body.title || '').trim();
    const kind = body.kind === 'table' ? 'table' : 'text';
    const text = kind === 'text' ? String(body.body || '') : '';
    const data = kind === 'table' ? serialiseTable(body.table) : '';
    if (!title && kind === 'text' && !text.trim()) {
      throw new HttpError(400, 'Give the note a title or some content');
    }
    if (!title && kind === 'table' && !parseTable(data).columns.length) {
      throw new HttpError(400, 'Give the note a title or some columns');
    }

    const created = await db.get(
      `INSERT INTO info_entries (scope, scope_id, title, body, category, kind, data, env, pinned, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        scope,
        scopeId,
        title,
        text,
        String(body.category || 'General').trim() || 'General',
        kind,
        data,
        env,
        body.pinned ? 1 : 0,
        ctx.user.id,
        nowISO(),
        nowISO(),
      ]
    );
    const row = await db.get(
      `SELECT e.*, u.name AS created_by_name FROM info_entries e
         LEFT JOIN users u ON u.id = e.created_by WHERE e.id = ?`,
      [Number(created.id)]
    );
    return { entry: shapeInfoEntry(row) };
  },


  'PATCH /api/info/:id': async (ctx) => {
    const row = await db.get('SELECT * FROM info_entries WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Note not found');
    // Anyone may edit shared knowledge; the audit trail keeps the author.
    const body = ctx.body || {};
    const next = {
      title: body.title !== undefined ? String(body.title).trim() : row.title,
      body: body.body !== undefined ? String(body.body) : row.body,
      env:
        body.env !== undefined ? documentEnv(row.scope, body.env) : (row.env || 'Dev'),
      category:
        body.category !== undefined ? String(body.category).trim() || 'General' : row.category,
      kind: body.kind !== undefined ? (body.kind === 'table' ? 'table' : 'text') : row.kind || 'text',
      data: body.table !== undefined ? serialiseTable(body.table) : row.data || '',
      pinned: body.pinned !== undefined ? (body.pinned ? 1 : 0) : row.pinned,
    };
    if (next.kind === 'text') {
      if (!next.title && !String(next.body || '').trim()) {
        throw new HttpError(400, 'Give the note a title or some content');
      }
    } else if (!next.title && !parseTable(next.data).columns.length) {
      throw new HttpError(400, 'Give the note a title or some columns');
    }
    // Pinning is a bookmark, not an edit, and neither is moving a note between
    // Dev and Prod — so `pinned` and `env` are written but not compared: bumping
    // the stamp for them would make the note claim "edited just now" and
    // reshuffle the date order under the user.
    const stamp = editStamp(
      { ...row, kind: row.kind || 'text' },
      {
        title: next.title,
        body: next.body,
        category: next.category,
        kind: next.kind,
        data: next.data,
      }
    );
    await db.run(
      `UPDATE info_entries SET title = ?, body = ?, category = ?, kind = ?, data = ?, env = ?, pinned = ?, updated_at = ?
        WHERE id = ?`,
      [next.title, next.body, next.category, next.kind, next.data, next.env, next.pinned, stamp, row.id]
    );
    const updated = await db.get(
      `SELECT e.*, u.name AS created_by_name FROM info_entries e
         LEFT JOIN users u ON u.id = e.created_by WHERE e.id = ?`,
      [row.id]
    );
    return { entry: shapeInfoEntry(updated) };
  },


  'DELETE /api/info/:id': async (ctx) => {
    const row = await db.get('SELECT * FROM info_entries WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Note not found');
    await db.run('DELETE FROM info_entries WHERE id = ?', [row.id]);
    return { ok: true };
  },
};
