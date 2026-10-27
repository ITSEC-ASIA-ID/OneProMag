import {
  db,
  ENUMS,
  canManageCatalog,
  DEVICE_FIELDS,
  DEVICE_LABELS,
  DEVICE_COLUMNS,
  DEVICE_KINDS,
} from './db.js';
import { HttpError, nowISO, listUsers, createUser, getPublicUser } from './auth.js';

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/* ============================================================
   Project properties (Admin panel → Properties)
   ------------------------------------------------------------
   The categories and statuses a project can carry used to be hard-coded
   arrays shared by client and server. They are rows now, so an admin can
   add "Cloud" or rename "Ongoing" without a deploy.

   Two invariants keep the rest of the code honest:
     * a project stores the property's `key`, never its `label`, so a
       rename is a display change and not a migration;
     * the seeded rows are `locked`: their key is compared against in SQL
       ('Done' ends an engagement, 'Mobile' owns the platform field), so
       the label, colour and order are editable but the row cannot vanish.

   The list is cached for the process because it is read on every project
   write (validation) and on every page (badges). Every writer below drops
   the cache.
   ============================================================ */
const PROPERTY_KINDS = ['category', 'status'];
const PROPERTY_TONES = ['slate', 'blue', 'cyan', 'violet', 'amber', 'green', 'rose'];

let propertyCache = null;

function shapeProperty(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    key: row.key,
    label: row.label,
    tone: row.tone || 'slate',
    position: Number(row.position || 0),
    locked: Boolean(Number(row.locked)),
  };
}

/** All properties, grouped by kind. Cached until a writer clears it. */
async function properties() {
  if (propertyCache) return propertyCache;
  const rows = await db.all(
    'SELECT id, kind, key, label, tone, position, locked FROM properties ORDER BY kind, position, id'
  );
  const grouped = { category: [], status: [] };
  for (const row of rows) {
    const shaped = shapeProperty(row);
    if (grouped[shaped.kind]) grouped[shaped.kind].push(shaped);
  }
  propertyCache = grouped;
  return grouped;
}

function clearPropertyCache() {
  propertyCache = null;
}

/** The stored keys for one kind, in display order. */
async function propertyKeys(kind) {
  return (await properties())[kind].map((p) => p.key);
}

/**
 * Validate a value against the live property list.
 *
 * Same contract as `pick()`: an unknown value silently falls back, which is what
 * keeps a stale client (a tab opened before an admin renamed something) from writing
 * a status nobody can render.
 */
async function pickProperty(kind, value, fallback) {
  const keys = await propertyKeys(kind);
  return keys.includes(value) ? value : fallback;
}

/** A key nobody can see: derived from the label, made unique within its kind. */
async function uniquePropertyKey(kind, label) {
  const base =
    String(label)
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40) || 'Untitled';
  const taken = new Set((await propertyKeys(kind)).map((k) => k.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`.toLowerCase())) i += 1;
  return `${base} ${i}`;
}

/** Every response from a property writer carries the fresh list, so the UI repaints. */
async function propertiesPayload() {
  const all = await properties();
  return { categories: all.category, statuses: all.status };
}

/**
 * Project list/detail select.
 *
 * The correlated subqueries for retest counts work verbatim on SQLite and
 * PostgreSQL. Pentesters are NOT joined here: GROUP_CONCAT (SQLite) and
 * string_agg (Postgres) differ, and building a '|||' delimited string then
 * splitting it in JS is fragile. They are fetched in one follow-up query and
 * grouped in memory instead — see attachPentesters().
 */
const projectSelect = `
  SELECT p.*,
         c.short_name AS client_short,
         a.name AS application_name,
         m.name AS manager_name,
         m.email AS manager_email,
         m.phone AS manager_phone,
         (SELECT COUNT(*) FROM retests r WHERE r.project_id = p.id) AS retest_count,
         (SELECT COUNT(*) FROM retests r WHERE r.project_id = p.id AND ${retestOpen('r')}) AS open_retest_count
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN applications a ON a.id = p.application_id
    LEFT JOIN users m ON m.id = p.manager_id
`;

/**
 * Today as YYYY-MM-DD in local time. Used for the automatic start/end stamps:
 * moving a project to Ongoing stamps the start, moving it to Done stamps the end.
 */
function todayDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Resolves the start/end dates for a status transition.
 *
 * Rules (both for projects and for their retests):
 *  - Entering `Ongoing` stamps `started_at` with today, but only if it is empty;
 *    re-opening an already-started project must not overwrite the real start.
 *  - Entering `Done` stamps `ended_at` with today, also only if empty.
 *  - Explicit values from the request always win, so the dates stay editable.
 */
function resolveDates(body, row, nextStatus, prevStatus) {
  const explicitStart = body.startedAt !== undefined ? String(body.startedAt || '').trim() : undefined;
  const explicitEnd = body.endedAt !== undefined ? String(body.endedAt || '').trim() : undefined;

  let startedAt = explicitStart !== undefined ? explicitStart : row.started_at || '';
  let endedAt = explicitEnd !== undefined ? explicitEnd : row.ended_at || '';

  const changed = nextStatus !== prevStatus;
  if (changed && nextStatus === 'Ongoing' && !startedAt) startedAt = todayDate();
  if (changed && nextStatus === 'Done' && !endedAt) endedAt = todayDate();
  // Re-opening a finished engagement clears the end date: it is ongoing again,
  // so keeping a completion date would be a lie.
  if (changed && prevStatus === 'Done' && nextStatus !== 'Done') endedAt = '';

  return { startedAt, endedAt };
}

function shapeProject(row, pentesters = []) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    client: row.client || '',
    clientId: row.client_id ?? null,
    clientShort: row.client_short || '',
    applicationId: row.application_id ?? null,
    applicationName: row.application_name || '',
    // One project manager per project. The name/email/phone are joined in
    // projectSelect so the list, table and drawer never need an extra request.
    managerId: row.manager_id ?? null,
    managerName: row.manager_name || '',
    managerEmail: row.manager_email || '',
    managerPhone: row.manager_phone || '',
    category: row.category,
    platform: row.platform || '',
    env: row.env,
    method: row.method,
    status: row.status,
    notes: row.notes,
    startedAt: row.started_at || '',
    endedAt: row.ended_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    retestCount: Number(row.retest_count ?? 0),
    openRetestCount: Number(row.open_retest_count ?? 0),
    pentesters,
    // Whether this project is sitting in the retest queue.
    inRetestQueue: Number(row.open_retest_count ?? 0) > 0,
  };
}

function shapeRetest(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    title: row.title,
    findings: row.findings,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    status: row.status,
    notes: row.notes,
    startedAt: row.started_at || '',
    endedAt: row.ended_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shapeClient(row, managers = []) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    applicationCount: Number(row.application_count ?? 0),
    projectCount: Number(row.project_count ?? 0),
    // The PMs who usually handle this client, used to pre-fill the project form.
    managers,
  };
}

/**
 * Project managers of the given clients, grouped into a Map.
 * Same N+1-avoiding shape as pentestersByProject().
 */
async function managersByClient(clientIds) {
  const map = new Map();
  if (!clientIds.length) return map;
  const placeholders = clientIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT cm.client_id, u.id, u.name, u.email, u.phone
       FROM client_managers cm
       JOIN users u ON u.id = cm.user_id
      WHERE cm.client_id IN (${placeholders})
      ORDER BY u.name`,
    clientIds
  );
  for (const row of rows) {
    const key = Number(row.client_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: Number(row.id),
      name: row.name,
      email: row.email || '',
      phone: row.phone || '',
    });
  }
  return map;
}

/** Replaces the default-PM set of one client. */
async function setClientManagers(tx, clientId, userIds) {
  await tx.run('DELETE FROM client_managers WHERE client_id = ?', [clientId]);
  const unique = [...new Set((userIds || []).map(Number).filter(Boolean))];
  for (const uid of unique) {
    const exists = await tx.get("SELECT id FROM users WHERE id = ? AND role = 'Project Manager'", [
      uid,
    ]);
    // Silently skipping a non-PM keeps the request forgiving; the UI only ever
    // offers Project Manager rows anyway.
    if (exists) {
      await tx.run('INSERT INTO client_managers (client_id, user_id) VALUES (?, ?)', [clientId, uid]);
    }
  }
}

/** Validates a project's owner: it must reference an existing Project Manager. */
async function resolveManagerId(tx, value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  const row = await tx.get('SELECT id, role FROM users WHERE id = ?', [id]);
  if (!row) throw new HttpError(400, 'Selected project manager does not exist');
  if (row.role !== 'Project Manager') {
    throw new HttpError(400, 'That user is not a Project Manager');
  }
  return id;
}

function shapeApplication(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    notes: row.notes || '',
    createdAt: row.created_at,
    projectCount: Number(row.project_count ?? 0),
  };
}

/**
 * A note can only hang off a client or application that really exists; without
 * this a typo'd scopeId would silently create orphan notes nothing links to.
 */
async function assertScopeExists(scope, scopeId) {
  const table = scope === 'client' ? 'clients' : 'applications';
  const row = await db.get(`SELECT id FROM ${table} WHERE id = ?`, [scopeId]);
  if (!row) {
    throw new HttpError(404, scope === 'client' ? 'Client not found' : 'Application not found');
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
    throw new HttpError(400, 'Only applications have a production environment');
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
 * One device row in its API shape: camelCase field names plus the kind's field
 * list, so a client rendering the row never has to know the column map.
 */
function shapeDevice(row) {
  const fields = DEVICE_FIELDS[row.kind] || DEVICE_FIELDS.Misc;
  const out = {
    id: Number(row.id),
    kind: row.kind,
    fields,
    position: Number(row.position ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  for (const key of Object.keys(DEVICE_COLUMNS)) {
    // Only expose the fields this kind owns. Anything else in the row is either
    // a leftover from a previous kind or a column another kind added later.
    if (fields.includes(key)) out[key] = row[DEVICE_COLUMNS[key]] ?? '';
  }
  // User-added columns live in one JSON blob. A malformed blob must not take the
  // whole inventory page down, so it degrades to "no extra values" instead.
  out.extra = parseExtra(row.extra);
  return out;
}

function parseExtra(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The column configuration for one kind.
 *
 * Returns the prescribed columns on the first read of a kind, then persists that
 * layout, so the default is exactly the field list the product prescribes while
 * the user stays free to reorder, hide, rename or extend it. Persisting rather
 * than synthesising means a user who deletes a prescribed column does not see it
 * reappear on the next load.
 */
async function ensureColumns(tx, kind) {
  const run = tx || db;
  const existing = await run.all(
    'SELECT * FROM device_columns WHERE kind = ? ORDER BY position ASC, id ASC',
    [kind]
  );
  if (existing.length) return existing;
  const fields = DEVICE_FIELDS[kind] || DEVICE_FIELDS.Misc;
  let i = 0;
  for (const key of fields) {
    await run.run(
      'INSERT INTO device_columns (kind, key, label, position, hidden, builtin) VALUES (?, ?, ?, ?, 0, 1)',
      [kind, key, DEVICE_LABELS[key] || key, i++]
    );
  }
  // The notes column is prose; every other prescribed column is a short value.
  return run.all('SELECT * FROM device_columns WHERE kind = ? ORDER BY position ASC, id ASC', [kind]);
}

function shapeColumn(row) {
  return {
    id: Number(row.id),
    key: row.key,
    label: row.label,
    position: Number(row.position ?? 0),
    hidden: Number(row.hidden) === 1,
    builtin: Number(row.builtin) === 1,
  };
}

/**
 * Which stored columns a kind's config needs. A column is either a built-in field
 * (its own real column) or a user-added one (a key inside the `extra` JSON).
 */
function columnValueFor(device, col) {
  if (col.builtin && DEVICE_COLUMNS[col.key]) return device[col.key] ?? '';
  const v = device.extra?.[col.key];
  return v === undefined || v === null ? '' : String(v);
}

/**
 * Builds the write payload for one device.
 *
 * `current` is the existing shaped row when patching, or null when creating. A
 * field absent from the request keeps its current value (partial update); a field
 * this kind does not own is DROPPED rather than written, which is what makes a
 * kind change safe. Values are trimmed of the whitespace that a paste leaves
 * behind, and capped so a pasted log cannot bloat a row.
 */
function collectDeviceFields(kind, body, current, columns = []) {
  const owned = DEVICE_FIELDS[kind];
  const out = {};
  for (const key of Object.keys(DEVICE_COLUMNS)) {
    if (!owned.includes(key)) continue;
    const given = body[key];
    if (given === undefined) out[key] = String(current?.[key] ?? '');
    else out[key] = String(given ?? '').slice(0, 2000).trim();
  }
  // User-added columns arrive together in `extra`, keyed by their column key. Only
  // keys that exist in this kind's config survive, so a stale key from another
  // kind's form cannot be smuggled in and stored forever.
  const extra = { ...(current?.extra || {}) };
  const allowed = new Set(columns.filter((c) => !c.builtin).map((c) => c.key));
  const incoming = body.extra;
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    for (const [key, value] of Object.entries(incoming)) {
      if (!allowed.has(key)) continue;
      extra[key] = String(value ?? '').slice(0, 2000).trim();
    }
  }
  out.extra = JSON.stringify(extra);
  return out;
}

async function readDevice(id) {
  const row = await db.get('SELECT * FROM devices WHERE id = ?', [id]);
  return row ? shapeDevice(row) : null;
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

/**
 * One query for every pentester of the given projects, grouped into a Map.
 * Avoids N+1 while staying portable across both engines.
 */
async function pentestersByProject(projectIds) {
  const map = new Map();
  if (!projectIds.length) return map;
  const placeholders = projectIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT pp.project_id, u.id, u.name, u.subrole
       FROM project_pentesters pp
       JOIN users u ON u.id = pp.user_id
      WHERE pp.project_id IN (${placeholders})`,
    projectIds
  );
  const rank = ENUMS.subroleRank;
  for (const row of rows) {
    const key = Number(row.project_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ id: row.id, name: row.name, subrole: row.subrole || 'Member' });
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) => (rank[a.subrole] ?? 9) - (rank[b.subrole] ?? 9) || a.name.localeCompare(b.name)
    );
  }
  return map;
}

async function getProjectRaw(id) {
  return db.get(`${projectSelect} WHERE p.id = ?`, [id]);
}

async function assertProject(id) {
  const row = await getProjectRaw(id);
  if (!row) throw new HttpError(404, 'Project not found');
  return row;
}

/** Shapes one project including its pentesters. */
async function loadProject(id) {
  const row = await getProjectRaw(id);
  if (!row) return null;
  const map = await pentestersByProject([Number(row.id)]);
  return shapeProject(row, map.get(Number(row.id)) || []);
}

async function setPentesters(tx, projectId, userIds) {
  await tx.run('DELETE FROM project_pentesters WHERE project_id = ?', [projectId]);
  const unique = [...new Set((userIds || []).map(Number).filter(Boolean))];
  for (const uid of unique) {
    // Only a pentester can sit on the test bench. Without the role filter a
    // project manager or an admin could be written into project_pentesters by
    // PATCH /api/projects/:id, which then showed up in the assignment picker and
    // counted against nobody on the board (it only lists pentesters).
    const exists = await tx.get("SELECT id FROM users WHERE id = ? AND role = 'Pentester'", [uid]);
    if (exists) {
      await tx.run('INSERT INTO project_pentesters (project_id, user_id) VALUES (?, ?)', [
        projectId,
        uid,
      ]);
    }
  }
}

/**
 * Resolves the client/application reference for a project payload.
 *
 * The client is NOT free text any more: it must be an existing client row, and
 * when applicationId is given that application must belong to that client.
 * `projects.client` keeps a denormalised copy of the client name so existing
 * rows and exports stay readable.
 */
async function resolveClientRef(tx, body, existing = null) {
  let clientId = existing?.client_id ?? null;
  if (body.clientId !== undefined) {
    clientId = body.clientId === null || body.clientId === '' ? null : Number(body.clientId);
  }
  let applicationId = existing?.application_id ?? null;
  if (body.applicationId !== undefined) {
    applicationId =
      body.applicationId === null || body.applicationId === '' ? null : Number(body.applicationId);
  }

  let clientName = existing?.client || '';
  if (clientId) {
    const client = await tx.get('SELECT id, name FROM clients WHERE id = ?', [clientId]);
    if (!client) throw new HttpError(400, 'Selected client does not exist');
    clientName = client.name;
  } else {
    clientName = '';
    applicationId = null;
  }

  if (applicationId) {
    const app = await tx.get('SELECT id, client_id FROM applications WHERE id = ?', [applicationId]);
    if (!app) throw new HttpError(400, 'Selected application does not exist');
    if (Number(app.client_id) !== Number(clientId)) {
      throw new HttpError(400, 'That application does not belong to the selected client');
    }
  }

  return { clientId, applicationId, clientName };
}

/**
 * Next retest code for a project: RT-<projectId>-<seq>.
 *
 * Derived from the highest existing sequence, not from COUNT(*). Counting is
 * wrong as soon as a retest is deleted: create 01+02, delete 01, count is 1 ->
 * the next insert would mint 02 again and collide. The unique index on
 * (project_id, code) makes any residual race fail loudly instead of silently
 * duplicating, and the caller retries.
 */
async function nextRetestCode(tx, projectId) {
  const rows = await tx.all('SELECT code FROM retests WHERE project_id = ?', [projectId]);
  const prefix = `RT-${String(projectId).padStart(3, '0')}-`;
  let max = 0;
  for (const { code } of rows) {
    if (!code || !code.startsWith(prefix)) continue;
    const seq = Number(code.slice(prefix.length));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

/**
 * What counts as an OPEN retest — the predicate behind the Active lists, the retest
 * queue card, the board chips and the "in use" check when deleting a status.
 *
 * "Not Done" rather than a list of the three statuses that happened to be in use
 * when this was written: a retest on `Hold` is paused work, not history, and it was
 * invisible everywhere because only `Incoming`/`Ongoing` matched. Anything an admin
 * adds as a status (a custom `Blocked`, say) is open by the same rule, and `Done` is
 * the one status the workflow locks, so this cannot be emptied from the UI.
 */
function retestOpen(alias = '') {
  return `${alias ? `${alias}.` : ''}status <> 'Done'`;
}

function isUniqueViolation(err) {
  // Postgres: 23505. SQLite: "UNIQUE constraint failed".
  return err?.code === '23505' || /UNIQUE constraint failed/i.test(String(err?.message || ''));
}

function requireCatalogManager(ctx) {
  if (!canManageCatalog(ctx.user)) {
    throw new HttpError(403, 'Only admin, lead or sub lead can open the admin panel');
  }
}

/**
 * Deleting is the one thing a plain pentester cannot do.
 *
 * Creating and editing stay open to everyone signed in — a tester files the
 * retest request, moves the engagement to Ready, writes the device inventory,
 * and that is the job. Deleting is not part of that job and it is not
 * reversible: `DELETE FROM projects` cascades to the retests and the team
 * assignment, and the notes behind it, with no soft delete and no undo. So the
 * confirmation dialog is not the only thing standing between a misclick and a
 * lost engagement.
 *
 * `label` names the record in the message ("a project"), because "Not allowed"
 * tells the person nothing about what they tried to remove.
 */
function requireDeleter(ctx, label) {
  if (!canManageCatalog(ctx.user)) {
    throw new HttpError(403, `Only admin, lead or sub lead can delete ${label}`);
  }
}

/* ============================================================
   Pentester hierarchy (Admin panel)
   ------------------------------------------------------------
   `parent_id` points at the person directly above:

       Lead  (no parent)
         ├── Sub Lead  (parent = a Lead)
         └── Member    (parent = a Sub Lead or a Lead)
               └── Intern  (parent = a Member, a Sub Lead or a Lead)

   Below a lead the tree is a set, not a chain: a member answers to whoever runs
   their work, which on a small team is the lead directly, and an intern answers to
   whoever is training them. A sub lead can only ever report to a lead, so the two
   levels above stay strict.

   Validating this on the server matters: the picker in the UI only
   offers legal choices, but the API is reachable directly.
   ============================================================ */
const PARENT_SUBROLE = {
  'Sub Lead': ['Lead'],
  // A member may sit under the sub lead who runs their day-to-day work, or under the
  // lead directly when there is no sub lead between them.
  Member: ['Sub Lead', 'Lead'],
  Intern: ['Member', 'Sub Lead', 'Lead'],
};

/** "a member, a sub lead or a lead" — the phrase a human gets for a bad parent. */
function parentNames(subrole) {
  const names = (PARENT_SUBROLE[subrole] || []).map((s) => `${article(s)} ${s.toLowerCase()}`);
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** "an Intern", "a Member" — used so error copy reads like a sentence. */
function article(word) {
  return /^[aeiou]/i.test(String(word)) ? 'an' : 'a';
}

async function validateParent(subrole, parentId, selfId = null) {
  const allowed = PARENT_SUBROLE[subrole];
  // A Lead sits at the top of the tree, so it can never have a parent.
  if (!allowed) {
    if (parentId) throw new HttpError(400, 'A lead does not report to anyone');
    return null;
  }
  if (!parentId) {
    throw new HttpError(400, `${article(subrole)} ${subrole} must report to ${parentNames(subrole)}`);
  }
  const id = Number(parentId);
  if (selfId && id === Number(selfId)) {
    throw new HttpError(400, 'A pentester cannot report to themselves');
  }
  const parent = await db.get('SELECT id, name, subrole, parent_id FROM users WHERE id = ?', [id]);
  if (!parent) throw new HttpError(400, 'That manager does not exist');
  if (!allowed.includes(parent.subrole)) {
    throw new HttpError(
      400,
      `${article(subrole)} ${subrole} must report to ${parentNames(subrole)}, not ${article(
        parent.subrole
      )} ${parent.subrole.toLowerCase()}`
    );
  }
  // Guard against a cycle: walk up from the proposed parent.
  let cursor = parent;
  for (let depth = 0; cursor && depth < 12; depth++) {
    if (selfId && Number(cursor.id) === Number(selfId)) {
      throw new HttpError(400, 'That would create a reporting loop');
    }
    cursor = cursor.parent_id
      ? await db.get('SELECT id, parent_id, subrole FROM users WHERE id = ?', [cursor.parent_id])
      : null;
  }
  return id;
}

/** Users as a nested tree: [{...lead, children:[{...subLead, children:[...members]}]}] */
function shapePentester(row) {
  return {
    id: Number(row.id),
    username: row.username,
    name: row.name,
    role: row.role,
    subrole: row.subrole || 'Member',
    // listUsers() returns raw columns, so normalise snake_case -> camelCase.
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    availability: row.availability || '',
    availabilityNote: row.availability_note || '',
    phone: row.phone || '',
    email: row.email || '',
  };
}

function buildPentesterTree(users) {
  const byId = new Map(users.map((u) => [Number(u.id), { ...u, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(Number(node.parentId)) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const rank = ENUMS.subroleRank;
  const sortTree = (list) => {
    list.sort(
      (a, b) =>
        (rank[a.subrole] ?? 9) - (rank[b.subrole] ?? 9) ||
        String(a.name).localeCompare(String(b.name))
    );
    list.forEach((n) => sortTree(n.children));
  };
  sortTree(roots);
  return roots;
}

/* ============================================================
   Availability board
   ------------------------------------------------------------
   Every pentester has one row. The status is AUTOMATIC unless a
   manual value is stored on the user:

       manual value set  ->  show it (Leave / Exam / Research-Learning / Other)
       no manual value   ->  On Project if they sit on at least one project
                             that is not Done, otherwise Idle

   `idle_since` is the last day the person finished a piece of work:
   the newest ended_at among their projects, falling back to the
   newest ended_at among their retests. When they move back onto a
   project that clock is simply not displayed any more.
   ============================================================ */
function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days between an ISO date (YYYY-MM-DD) and today. 0 when unknown. */
function daysSince(iso) {
  if (!iso) return 0;
  const then = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  const now = new Date(`${todayISO()}T00:00:00`);
  const diff = Math.round((now.getTime() - then.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

async function activeAssignments() {
  const rows = await db.all(
    `SELECT pp.user_id, p.id AS project_id, p.name AS project_name, p.status
       FROM project_pentesters pp
       JOIN projects p ON p.id = pp.project_id`
  );
  const byUser = new Map();
  for (const row of rows) {
    const uid = Number(row.user_id);
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push({
      id: Number(row.project_id),
      name: row.project_name,
      status: row.status,
    });
  }
  return byUser;
}

/** Newest completion date per user, across projects and retests. */
async function lastFinishedByUser() {
  const projectRows = await db.all(
    `SELECT pp.user_id, MAX(p.ended_at) AS last_end
       FROM project_pentesters pp
       JOIN projects p ON p.id = pp.project_id
      WHERE p.ended_at IS NOT NULL AND p.ended_at <> ''
      GROUP BY pp.user_id`
  );
  const retestRows = await db.all(
    `SELECT pp.user_id, MAX(r.ended_at) AS last_end
       FROM project_pentesters pp
       JOIN retests r ON r.project_id = pp.project_id
      WHERE r.ended_at IS NOT NULL AND r.ended_at <> ''
      GROUP BY pp.user_id`
  );
  const out = new Map();
  for (const row of [...projectRows, ...retestRows]) {
    const uid = Number(row.user_id);
    const prev = out.get(uid);
    if (!prev || String(row.last_end) > String(prev)) out.set(uid, String(row.last_end));
  }
  return out;
}

/** Builds the board rows: one per user, already ordered Lead > Sub Lead > Member. */
/**
 * Open retest requests, grouped by the project that owns them.
 *
 * A retest has no assignee of its own: it belongs to a project, and the people on
 * that project are the people who do it. That is why the board shows them next to
 * the project chips — a pentester whose only outstanding work is a retest on a
 * finished engagement is not idle, and saying so was the whole problem.
 */
/**
 * Open retest requests for a set of project ids, keyed by project.
 *
 * One query for the whole page: the project list expands each open retest into its
 * own row, so every project on screen needs them, and asking per project would be
 * N+1 on the hottest endpoint in the app.
 */
async function openRetestsForProjects(ids) {
  if (!ids.length) return new Map();
  const rows = await db.all(
    `SELECT id, project_id, code, title, status, requested_at, started_at
       FROM retests
      WHERE status <> 'Done'
        AND project_id IN (${ids.map(() => '?').join(',')})
      ORDER BY id`,
    ids
  );
  const map = new Map();
  for (const row of rows) {
    const pid = Number(row.project_id);
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push({
      id: Number(row.id),
      code: row.code,
      title: row.title,
      status: row.status,
      requestedAt: row.requested_at || '',
      startedAt: row.started_at || '',
    });
  }
  return map;
}

async function openRetestsByProject() {
  const rows = await db.all(
    `SELECT id, project_id, code, title, status
       FROM retests
      WHERE status <> 'Done'`
  );
  const byProject = new Map();
  for (const row of rows) {
    const pid = Number(row.project_id);
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push({
      id: Number(row.id),
      code: row.code,
      title: row.title,
      status: row.status,
    });
  }
  return byProject;
}

async function buildBoard() {
  // The board is the testing bench, so it holds the people who do the testing:
  // Project Managers own engagements rather than test them, and Administrators are
  // operations — both are lookup entries (Users, Manage users), not rows here.
  // A team whose only Lead is an admin therefore starts at sub-lead level; the
  // hierarchy order degrades to "whoever has no parent shown first", never to a
  // missing person.
  const users = (await listUsers())
    .map(shapePentester)
    .filter((u) => u.role !== 'Project Manager' && u.role !== 'Admin');
  const assignments = await activeAssignments();
  const openRetests = await openRetestsByProject();
  const lastFinished = await lastFinishedByUser();
  return users.map((u) => {
    const all = assignments.get(u.id) || [];
    const current = all.filter((p) => p.status !== 'Done');
    // Retests hang off the project: whoever is on the project does them. They are
    // listed separately so the board can print them as "Retest - <project>" instead
    // of pretending they are another engagement.
    //
    // Drawn from EVERY assigned project, not just the unfinished ones: the usual
    // life of a retest is "the engagement closed, the client asked for another
    // pass", so filtering out Done projects would hide exactly the work this
    // column exists to show.
    const retests = all
      .flatMap((p) =>
        (openRetests.get(Number(p.id)) || []).map((r) => ({
          ...r,
          projectId: Number(p.id),
          projectName: p.name,
        }))
      )
      .sort((a, b) => a.projectName.localeCompare(b.projectName) || a.id - b.id);
    const manual = u.availability || '';
    // A retest is work: a pentester with one open retest is on a project even when
    // the engagement it belongs to is already finished. Without this the board
    // reported them idle and the idle clock started running against them.
    const busy = current.length > 0 || retests.length > 0;
    const autoStatus = busy ? 'On Project' : 'Idle';
    const status = manual || autoStatus;
    // While idle the count must start from the moment they actually BECAME
    // idle: the end date of the last project they closed. A pentester with no
    // closed project on record has no evidence of when that happened, so their
    // idle clock starts today rather than showing a blank date.
    const idleSince =
      status === 'Idle' ? lastFinished.get(u.id) || todayISO() : lastFinished.get(u.id) || '';
    return {
      ...u,
      status,
      automatic: !manual,
      currentProjects: current,
      currentRetests: retests,
      activeCount: current.length + retests.length,
      idleSince,
    };
  });
}

/** Sort order: hierarchy first (Lead, then a sub lead with their members, …). */
function orderBoard(rows) {
  const rank = ENUMS.subroleRank;
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const ordered = [];
  const leads = rows
    .filter((r) => !r.parentId || !byId.has(Number(r.parentId)))
    .sort((a, b) => (rank[a.subrole] ?? 9) - (rank[b.subrole] ?? 9) || a.name.localeCompare(b.name));
  const walk = (node) => {
    ordered.push(node);
    const kids = rows
      .filter((r) => Number(r.parentId) === Number(node.id))
      .sort((a, b) => (rank[a.subrole] ?? 9) - (rank[b.subrole] ?? 9) || a.name.localeCompare(b.name));
    kids.forEach(walk);
  };
  leads.forEach(walk);
  // Anyone unreachable through the tree still gets listed, never silently lost.
  rows.forEach((r) => {
    if (!ordered.includes(r)) ordered.push(r);
  });
  return ordered;
}

/** Member may only change their own row; Admin / Lead / Sub Lead may change anyone. */
function canEditAvailability(actor, targetId) {
  if (!actor) return false;
  if (canManageCatalog(actor)) return true;
  return Number(actor.id) === Number(targetId);
}

export const api = {
  // Feeds the "who pentest" picker, so it only ever returns Pentesters.
  // Project Managers have their own endpoint: mixing them in would let a PM be
  // assigned as a tester and would break the hierarchy badges.
  'GET /api/users': async () => ({
    users: (await listUsers()).map(shapePentester).filter((u) => u.role === 'Pentester'),
  }),

  /* ---------- project properties (Admin panel → Properties) ---------- */

  // Readable by any signed-in user: the project form, the filter bar and every
  // status badge are built from this list.
  'GET /api/properties': async () => {
    await properties();
    return propertiesPayload();
  },

  'POST /api/properties/:kind': async (ctx) => {
    requireCatalogManager(ctx);
    const kind = String(ctx.params.kind || '');
    if (!PROPERTY_KINDS.includes(kind)) {
      throw new HttpError(400, `Kind must be one of: ${PROPERTY_KINDS.join(', ')}`);
    }
    const body = ctx.body || {};
    const label = String(body.label || '').trim();
    if (!label) throw new HttpError(400, 'A name is required');
    if (label.length > 40) throw new HttpError(400, 'Keep the name under 40 characters');
    const tone = PROPERTY_TONES.includes(body.tone) ? body.tone : 'slate';
    const key = await uniquePropertyKey(kind, label);
    const list = (await properties())[kind];
    const position = list.length ? Math.max(...list.map((p) => p.position)) + 1 : 0;

    await db.run(
      `INSERT INTO properties (kind, key, label, tone, position, locked, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [kind, key, label, tone, position, 0, nowISO()]
    );
    clearPropertyCache();
    return { ...(await propertiesPayload()) };
  },

  // The label, the colour and the position are editable on every row, locked or not:
  // renaming "Ongoing" to "In progress" must not need a deploy. The KEY is not
  // editable anywhere, because that is what the project rows store.
  'PATCH /api/properties/:kind/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const kind = String(ctx.params.kind || '');
    if (!PROPERTY_KINDS.includes(kind)) {
      throw new HttpError(400, `Kind must be one of: ${PROPERTY_KINDS.join(', ')}`);
    }
    const row = await db.get('SELECT * FROM properties WHERE id = ? AND kind = ?', [
      ctx.params.id,
      kind,
    ]);
    if (!row) throw new HttpError(404, 'That property does not exist');
    const body = ctx.body || {};

    const label = body.label !== undefined ? String(body.label).trim() : row.label;
    if (!label) throw new HttpError(400, 'A name is required');
    if (label.length > 40) throw new HttpError(400, 'Keep the name under 40 characters');
    const tone = PROPERTY_TONES.includes(body.tone) ? body.tone : row.tone;
    const position =
      body.position !== undefined && Number.isFinite(Number(body.position))
        ? Number(body.position)
        : Number(row.position);

    await db.run('UPDATE properties SET label = ?, tone = ?, position = ? WHERE id = ?', [
      label,
      tone,
      position,
      row.id,
    ]);
    clearPropertyCache();
    return { ...(await propertiesPayload()) };
  },

  'PATCH /api/properties/order': async (ctx) => {
    requireCatalogManager(ctx);
    const body = ctx.body || {};
    const kind = String(body.kind || '');
    if (!PROPERTY_KINDS.includes(kind)) {
      throw new HttpError(400, `Kind must be one of: ${PROPERTY_KINDS.join(', ')}`);
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    for (const [index, id] of ids.entries()) {
      await db.run('UPDATE properties SET position = ? WHERE id = ? AND kind = ?', [
        index,
        id,
        kind,
      ]);
    }
    clearPropertyCache();
    return { ...(await propertiesPayload()) };
  },

  /**
   * Deleting a property.
   *
   * A locked row is refused outright: the workflow compares project status against
   * the literal 'Done' and treats 'Mobile' as the only category with a platform, so
   * removing either would leave data nobody can render. A row a project still uses is
   * refused too, with the count — the same rule as deleting a client or a manager.
   */
  'DELETE /api/properties/:kind/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const kind = String(ctx.params.kind || '');
    if (!PROPERTY_KINDS.includes(kind)) {
      throw new HttpError(400, `Kind must be one of: ${PROPERTY_KINDS.join(', ')}`);
    }
    const row = await db.get('SELECT * FROM properties WHERE id = ? AND kind = ?', [
      ctx.params.id,
      kind,
    ]);
    if (!row) throw new HttpError(404, 'That property does not exist');
    if (Number(row.locked)) {
      throw new HttpError(
        409,
        `“${row.label}” is built into the workflow. Rename or recolour it instead — its key cannot be removed.`
      );
    }
    const column = kind === 'category' ? 'category' : 'status';
    const used = await db.get(`SELECT COUNT(*) AS n FROM projects WHERE ${column} = ?`, [row.key]);
    if (Number(used.n) > 0) {
      throw new HttpError(
        409,
        `Cannot delete: ${used.n} project(s) still use “${row.label}”. Move them first.`
      );
    }
    // A status is also carried by client retest requests, which are not projects: a
    // retest left holding a status nobody can render would break its badge and its
    // quick menu just as quietly.
    if (kind === 'status') {
      const retests = await db.get('SELECT COUNT(*) AS n FROM retests WHERE status = ?', [row.key]);
      if (Number(retests.n) > 0) {
        throw new HttpError(
          409,
          `Cannot delete: ${retests.n} retest request(s) still use “${row.label}”. Move them first.`
        );
      }
    }
    await db.run('DELETE FROM properties WHERE id = ?', [row.id]);
    clearPropertyCache();
    return { ...(await propertiesPayload()) };
  },

  /**
   * The staff directory: every account with a login, for the read-only Users page.
   *
   * Any signed-in user may read it. That is the same rule as `GET /api/people/:id`
   * below and for the same reason: a colleague's office phone and e-mail is not
   * private data, and the whole point of the page is that a tester can reach the
   * project manager who owns the engagement. Writes stay behind their own guards.
   *
   * Unlike `/api/users` this is NOT filtered by role — it answers "who works here",
   * not "who can be assigned to a pentest", so admins belong in it too.
   */
  'GET /api/directory': async () => {
    const rows = await db.all(
      'SELECT id, username, name, role, subrole, email, phone FROM users'
    );
    return {
      users: rows
        .map(shapePentester)
        // A directory is read alphabetically. The tree has its own order for the
        // same people; hierarchy is the wrong shape when you are looking someone up.
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    };
  },

  /**
   * One person's card, for the click-through from a PM or pentester avatar.
   * Any signed-in user may look this up — the drawer already shows teammates'
   * names, and the contact details here are the office phone and e-mail of a
   * colleague, not private data. Writes stay behind their own guards.
   */
  'GET /api/people/:id': async (ctx) => {
    const row = await db.get(
      `SELECT id, username, name, role, subrole, parent_id, availability, availability_note, phone, email, created_at
         FROM users WHERE id = ?`,
      [ctx.params.id]
    );
    if (!row) throw new HttpError(404, 'Person not found');

    const person = shapePentester(row);

    // What they own vs. what they test, split so the card can label it properly.
    const managing = await db.all(
      `SELECT p.id, p.name, p.status, p.client
         FROM projects p WHERE p.manager_id = ?
        ORDER BY CASE p.status WHEN 'Ongoing' THEN 0 WHEN 'Incoming' THEN 1 WHEN 'Ready' THEN 2
                               WHEN 'Hold' THEN 3 WHEN 'Done' THEN 4 ELSE 5 END,
                 p.name`,
      [person.id]
    );
    const testing = await db.all(
      `SELECT p.id, p.name, p.status, p.client
         FROM project_pentesters pp JOIN projects p ON p.id = pp.project_id
        WHERE pp.user_id = ?
        ORDER BY CASE p.status WHEN 'Ongoing' THEN 0 WHEN 'Incoming' THEN 1 WHEN 'Ready' THEN 2
                               WHEN 'Hold' THEN 3 WHEN 'Done' THEN 4 ELSE 5 END,
                 p.name`,
      [person.id]
    );
    const reports = await db.all(
      `SELECT id, name, subrole FROM users WHERE parent_id = ? ORDER BY name`,
      [person.id]
    );

    const mapProject = (p) => ({
      id: Number(p.id),
      name: p.name,
      status: p.status,
      client: p.client || '',
    });

    const assignMap = await activeAssignments();
    const live = (assignMap.get(person.id) || []).filter((p) => p.status !== 'Done');
    // A Project Manager is not on the testing bench, so "Idle / On Project"
    // (which counts project_pentesters rows) would always say Idle for them.
    // Their load is the engagements they own instead.
    const owned = managing.map(mapProject).filter((p) => p.status !== 'Done');
    const derived = person.availability || (person.role === 'Project Manager'
      ? owned.length ? 'On Project' : 'Idle'
      : live.length ? 'On Project' : 'Idle');

    return {
      person: {
        ...person,
        createdAt: row.created_at,
        status: derived,
        automatic: !person.availability,
        currentProjects: person.role === 'Project Manager' ? owned : live,
      },
      managerOf: managing.map(mapProject),
      pentesterOn: testing.map(mapProject),
      reports: reports.map((r) => ({ id: Number(r.id), name: r.name, subrole: r.subrole || 'Member' })),
    };
  },

  'GET /api/managers': async () =>
    ({ managers: (await listUsers()).map(shapePentester).filter((u) => u.role === 'Project Manager') }),

  'GET /api/stats': async (ctx) => {
    const total = Number((await db.get('SELECT COUNT(*) AS n FROM projects'))?.n ?? 0);

    // ---- per-scope counters -------------------------------------------------
    // The four stat cards have to change when the scope changes: on "My active
    // projects" they must describe YOUR engagements, not the whole company's.
    // Every number below is produced by ONE query shape with an optional
    // "this project has me on it" clause, so the all-people and just-me
    // variants can never drift apart.
    //
    // `me` is the JOIN fragment, `meParam` its bound value, `meJoin` aliasing.
    const scopeStats = async (userId) => {
      const mine = userId == null ? '' : 'AND EXISTS (SELECT 1 FROM project_pentesters pp WHERE pp.project_id = p.id AND pp.user_id = ?)';
      const args = userId == null ? [] : [userId];

      const row = await db.get(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN p.status = 'Ready' THEN 1 ELSE 0 END) AS ready,
           -- Active counts ENGAGEMENTS still in flight. A finished engagement with
           -- a pending retest is not one of them any more: the retest has its own
           -- queue counter, and in the list it has its own rows. Counting it here
           -- made the badge say 5 while the list showed 4 project rows.
           SUM(CASE WHEN p.status <> 'Done' THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN EXISTS (SELECT 1 FROM retests r WHERE r.project_id = p.id AND ${retestOpen('r')})
                    THEN 1 ELSE 0 END) AS queue,
           SUM(CASE WHEN p.status = 'Ongoing' THEN 1 ELSE 0 END) AS ongoing,
           SUM(CASE WHEN p.category = 'Mobile' THEN 1 ELSE 0 END) AS mobile
         FROM projects p
         WHERE 1 = 1 ${mine}`,
        args
      );
      // Open retest REQUESTS, not projects that have one — the card counts
      // requests, so a single project with three open retests must read as 3.
      const openRow = await db.get(
        `SELECT COUNT(*) AS n FROM retests r
           JOIN projects p ON p.id = r.project_id
          WHERE ${retestOpen('r')} ${mine}`,
        args
      );
      // SUM() over zero rows is NULL, not 0 — normalise every counter.
      const n = (v) => Number(v ?? 0);
      return {
        total: n(row?.total),
        ready: n(row?.ready),
        active: n(row?.active),
        queue: n(row?.queue),
        ongoing: n(row?.ongoing),
        mobile: n(row?.mobile),
        openRetests: n(openRow?.n),
      };
    };

    const scopes = {
      all: await scopeStats(null),
      mine: await scopeStats(ctx.user.id),
    };

    // Seeded from the live property list, so a status the admin added shows a
    // zero instead of vanishing from the payload.
    const byStatus = Object.fromEntries((await propertyKeys('status')).map((s) => [s, 0]));
    for (const row of await db.all('SELECT status, COUNT(*) AS n FROM projects GROUP BY status')) {
      byStatus[row.status] = Number(row.n);
    }

    const byCategory = Object.fromEntries((await propertyKeys('category')).map((c) => [c, 0]));
    for (const row of await db.all('SELECT category, COUNT(*) AS n FROM projects GROUP BY category')) {
      byCategory[row.category] = Number(row.n);
    }

    const retests = Number((await db.get('SELECT COUNT(*) AS n FROM retests'))?.n ?? 0);
    const openRetests = Number(
      (await db.get("SELECT COUNT(*) AS n FROM retests WHERE status <> 'Done'"))?.n ?? 0
    );
    const prod = Number(
      (await db.get("SELECT COUNT(*) AS n FROM projects WHERE env = 'Prod'"))?.n ?? 0
    );
    // Active and Done are one split of the ENGAGEMENTS: everything not Done is
    // active, everything Done is done. They add up to the total, which is what a
    // reader of the cards expects.
    //
    // A finished engagement that still owes a retest is an engagement that is
    // Done — the retest is the open work, and it has its own rows in the list and
    // its own counter in the retest queue card. Counting it as active too made the
    // badge read 5 while the list showed 4 project rows.
    const byStatusCounts = await db.all('SELECT status, COUNT(*) AS n FROM projects GROUP BY status');
    const done = Number(
      byStatusCounts.filter((r) => r.status === 'Done').reduce((sum, r) => sum + Number(r.n), 0)
    );
    const active = Number(
      byStatusCounts.filter((r) => r.status !== 'Done').reduce((sum, r) => sum + Number(r.n), 0)
    );

    const clients = (
      await db.all('SELECT COUNT(*) AS n FROM clients')
    )[0]?.n ?? 0;
    const pentesters = Number(
      (await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'Pentester'"))?.n ?? 0
    );
    const managers = Number(
      (await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'Project Manager'"))?.n ?? 0
    );
    const applications = (
      await db.all('SELECT COUNT(*) AS n FROM applications')
    )[0]?.n ?? 0;
    const devices = Number((await db.get('SELECT COUNT(*) AS n FROM devices'))?.n ?? 0);

    // The two "My ..." scopes need their own totals for the sidebar, and they
    // must use EXACTLY the same predicate as GET /api/projects?mine=1 — a count
    // that disagrees with the list it links to is worse than no count at all.
    const mineActiveRows = await db.all(
      `SELECT COUNT(*) AS n FROM projects p
        WHERE EXISTS (SELECT 1 FROM project_pentesters pp WHERE pp.project_id = p.id AND pp.user_id = ?)
          AND (p.status <> 'Done'
               OR EXISTS (SELECT 1 FROM retests r
                           WHERE r.project_id = p.id AND ${retestOpen('r')}))`,
      [ctx.user.id]
    );
    const mineAllRows = await db.all(
      `SELECT COUNT(*) AS n FROM projects p
        WHERE EXISTS (SELECT 1 FROM project_pentesters pp WHERE pp.project_id = p.id AND pp.user_id = ?)`,
      [ctx.user.id]
    );
    const mineActive = Number(mineActiveRows[0]?.n ?? 0);
    const mineAll = Number(mineAllRows[0]?.n ?? 0);

    // Projects queued for retest: at least one open client retest request.
    const queue = (
      await db.get(
        `SELECT COUNT(*) AS n FROM projects p
          WHERE EXISTS (SELECT 1 FROM retests r WHERE r.project_id = p.id AND ${retestOpen('r')})`
      )
    )?.n ?? 0;

    return {
      total,
      active,
      done,
      byStatus,
      byCategory,
      retests,
      openRetests,
      prod,
      clients: Number(clients),
      applications: Number(applications),
      devices,
      pentesters,
      managers,
      mineActive,
      mineAll,
      scopes,
      queue: Number(queue),
      canManageCatalog: canManageCatalog(ctx?.user),
    };
  },

  'GET /api/projects': async (ctx) => {
    const {
      q, status, category, env, method, client, clientId, applicationId,
      mine, pentester, queue, activeOnly, finishedOnly, excludeStatus, inStatus,
    } = ctx.query;
    const where = [];
    const params = [];
    if (q) {
      // LOWER() on both sides keeps search case-insensitive on BOTH engines:
      // SQLite's LIKE already is, PostgreSQL's LIKE is NOT. LOWER() makes them agree.
      where.push(
        '(LOWER(p.name) LIKE ? OR LOWER(p.client) LIKE ? OR LOWER(p.notes) LIKE ? OR LOWER(p.category) LIKE ? OR LOWER(COALESCE(a.name, \'\')) LIKE ?)'
      );
      const needle = `%${String(q).toLowerCase()}%`;
      params.push(needle, needle, needle, needle, needle);
    }
    if (client) {
      where.push('p.client = ?');
      params.push(client);
    }
    if (clientId) {
      where.push('p.client_id = ?');
      params.push(Number(clientId));
    }
    if (applicationId) {
      where.push('p.application_id = ?');
      params.push(Number(applicationId));
    }
    if (status && (await propertyKeys('status')).includes(status)) {
      where.push('p.status = ?');
      params.push(status);
    }
    // "Active projects" workspace button: everything still in flight, so both
    // terminal outcomes (Done) are excluded. Accepts a comma list.
    if (excludeStatus) {
      const knownStatuses = await propertyKeys('status');
      const drop = String(excludeStatus)
        .split(',')
        .map((v) => v.trim())
        .filter((v) => knownStatuses.includes(v));
      if (drop.length) {
        where.push(`p.status NOT IN (${drop.map(() => '?').join(',')})`);
        params.push(...drop);
      }
    }
    // Active = still in flight, PLUS finished engagements that still owe a retest:
    // the project row itself is filtered out by the client, but its open retest
    // rows have to come from somewhere. `GET /api/stats` counts only the first
    // group as Active, which is why the badge and the project rows agree.
    if (activeOnly === '1' || activeOnly === true) {
      where.push(
        `(p.status <> 'Done' OR EXISTS (SELECT 1 FROM retests r2
                                        WHERE r2.project_id = p.id
                                          AND ${retestOpen('r2')}))`
      );
    }
    // Finished is the exact complement of Active: the pentest is Done AND there
    // is no open retest left. Keeping them complementary means a project shows
    // up in exactly one of the two views and the sidebar counts add up.
    if (finishedOnly === '1' || finishedOnly === true) {
      where.push(
        `(p.status = 'Done' AND NOT EXISTS (SELECT 1 FROM retests r2
                                            WHERE r2.project_id = p.id
                                              AND ${retestOpen('r2')}))`
      );
    }
    // The inverse: only these statuses (used by the "Finished" workspace item).
    if (inStatus) {
      const knownStatuses = await propertyKeys('status');
      const keep = String(inStatus)
        .split(',')
        .map((v) => v.trim())
        .filter((v) => knownStatuses.includes(v));
      if (keep.length) {
        where.push(`p.status IN (${keep.map(() => '?').join(',')})`);
        params.push(...keep);
      }
    }
    if (category && (await propertyKeys('category')).includes(category)) {
      where.push('p.category = ?');
      params.push(category);
    }
    if (env && ENUMS.env.includes(env)) {
      where.push('p.env = ?');
      params.push(env);
    }
    if (method && ENUMS.method.includes(method)) {
      where.push('p.method = ?');
      params.push(method);
    }
    if (mine === '1') {
      where.push(
        'EXISTS (SELECT 1 FROM project_pentesters pp WHERE pp.project_id = p.id AND pp.user_id = ?)'
      );
      params.push(ctx.user.id);
    }
    if (pentester) {
      where.push(
        'EXISTS (SELECT 1 FROM project_pentesters pp WHERE pp.project_id = p.id AND pp.user_id = ?)'
      );
      params.push(Number(pentester));
    }
    // Retest queue: projects with at least one open client retest request.
    if (queue === '1') {
      where.push(
        `EXISTS (SELECT 1 FROM retests r WHERE r.project_id = p.id AND ${retestOpen('r')})`
      );
    }
    const sql = `${projectSelect} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY
      CASE p.status
        WHEN 'Ongoing' THEN 0
        WHEN 'Incoming' THEN 1
        WHEN 'Ready' THEN 2
        WHEN 'Hold' THEN 3
        WHEN 'Done' THEN 4
        ELSE 5
      END,
      p.updated_at DESC`;

    const rows = await db.all(sql, params);
    const ids = rows.map((r) => Number(r.id));
    const [map, retests] = await Promise.all([pentestersByProject(ids), openRetestsForProjects(ids)]);
    return {
      projects: rows.map((row) => ({
        ...shapeProject(row, map.get(Number(row.id)) || []),
        // The list renders one row per open retest beside the engagement row, and
        // each of those rows carries its own status control — so the retest rows
        // have to arrive with the project, not behind another request.
        openRetests: retests.get(Number(row.id)) || [],
      })),
    };
  },

  'POST /api/projects': async (ctx) => {
    const body = ctx.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw new HttpError(400, 'Project name is required');
    // The client is a required picker in the UI; keep the API honest too.
    if (!body.clientId) throw new HttpError(400, 'Client is required');
    const ts = nowISO();

    // Resolved before the transaction opens: this validation reads the properties
    // table, and a transaction should not reach across to another connection for it.
    const category = await pickProperty('category', body.category, 'Web');
    const status = await pickProperty('status', body.status, 'Incoming');

    const id = await db.transaction(async (tx) => {
      const ref = await resolveClientRef(tx, body);
      // Platform is only stored for Mobile projects; anything else clears it.
      const platform = category === 'Mobile' ? pick(body.platform, ENUMS.platform, 'Android') : '';

      const managerId = await resolveManagerId(tx, body.managerId);
      const row = await tx.get(
        `INSERT INTO projects (name, client, client_id, application_id, manager_id, category, platform, env, method, status, notes, started_at, ended_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
          name,
          ref.clientName,
          ref.clientId,
          ref.applicationId,
          managerId,
          category,
          platform,
          pick(body.env, ENUMS.env, 'Dev'),
          pick(body.method, ENUMS.method, 'Grey Box'),
          status,
          String(body.notes || ''),
          String(body.startedAt || '').trim(),
          String(body.endedAt || '').trim(),
          ctx.user.id,
          ts,
          ts,
        ]
      );
      const projectId = Number(row.id);
      await setPentesters(tx, projectId, body.pentesterIds);
      return projectId;
    });

    return { project: await loadProject(id) };
  },

  'GET /api/projects/:id': async (ctx) => {
    const row = await assertProject(ctx.params.id);
    const retests = (
      await db.all('SELECT * FROM retests WHERE project_id = ? ORDER BY created_at DESC, id DESC', [
        row.id,
      ])
    ).map(shapeRetest);
    return { project: await loadProject(row.id), retests };
  },

  'PATCH /api/projects/:id': async (ctx) => {
    const row = await assertProject(ctx.params.id);
    const body = ctx.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : row.name;
    if (!name) throw new HttpError(400, 'Project name is required');

    // Same reason as the create: read the properties first, then transact.
    const nextCategory =
      body.category !== undefined
        ? await pickProperty('category', body.category, row.category)
        : row.category;
    const nextStatus =
      body.status !== undefined
        ? await pickProperty('status', body.status, row.status)
        : row.status;

    await db.transaction(async (tx) => {
      const ref = await resolveClientRef(tx, body, row);
      const category = nextCategory;
      const platform =
        category === 'Mobile'
          ? body.platform !== undefined
            ? pick(body.platform, ENUMS.platform, row.platform || 'Android')
            : row.platform || 'Android'
          : '';

      const dates = resolveDates(body, row, nextStatus, row.status);
      // Only touch the owner when the request mentions it, so a status-only
      // patch keeps whoever is accountable.
      const managerId =
        body.managerId !== undefined ? await resolveManagerId(tx, body.managerId) : row.manager_id ?? null;

      await tx.run(
        `UPDATE projects SET name = ?, client = ?, client_id = ?, application_id = ?, manager_id = ?, category = ?, platform = ?, env = ?, method = ?, status = ?, notes = ?, started_at = ?, ended_at = ?, updated_at = ?
          WHERE id = ?`,
        [
          name,
          ref.clientName,
          ref.clientId,
          ref.applicationId,
          managerId,
          category,
          platform,
          body.env !== undefined ? pick(body.env, ENUMS.env, row.env) : row.env,
          body.method !== undefined ? pick(body.method, ENUMS.method, row.method) : row.method,
          nextStatus,
          body.notes !== undefined ? String(body.notes) : row.notes,
          dates.startedAt,
          dates.endedAt,
          nowISO(),
          row.id,
        ]
      );
      if (Array.isArray(body.pentesterIds)) await setPentesters(tx, row.id, body.pentesterIds);
    });

    return { project: await loadProject(row.id) };
  },

  'DELETE /api/projects/:id': async (ctx) => {
    requireDeleter(ctx, 'a project');
    const row = await assertProject(ctx.params.id);
    // Notes and sheets cannot be orphaned here: `documents` and `info_entries` are
    // only ever written for the scopes 'client' and 'application' (both handlers
    // validate that), so a project owns no rows in either table.
    await db.run('DELETE FROM projects WHERE id = ?', [row.id]);
    return { ok: true };
  },

  'POST /api/projects/:id/retests': async (ctx) => {
    const project = await assertProject(ctx.params.id);
    const body = ctx.body || {};
    // A retest is a queued re-verification OF THIS PROJECT, so it is named after
    // the project rather than by a free-text title. The client contact who asked
    // for it is no longer captured in the form, so requested_by stays empty for
    // new requests (older rows keep whatever they already had).
    const title = String(body.title || '').trim() || `Retest of ${project.name}`;
    const requestedBy = String(body.requestedBy || '').trim();
    const ts = nowISO();

    // Compute the code INSIDE the transaction with the project row locked, so
    // two concurrent requests cannot read the same max sequence number.
    // SQLite: BEGIN IMMEDIATE already excludes writers (rowLock === '').
    // Postgres: SELECT ... FOR UPDATE serialises them on this project row.
    // The unique index remains the backstop; the retry loop only covers the
    // rare serialisation edge case.
    let inserted = null;
    const retestStatus = await pickProperty('status', body.status, 'Incoming');
    // A retest created straight into Ongoing/Done gets its dates stamped too.
    const retestDates = resolveDates(body, { started_at: '', ended_at: '' }, retestStatus, 'Incoming');

    for (let attempt = 0; attempt < 10 && !inserted; attempt += 1) {
      try {
        inserted = await db.transaction(async (tx) => {
          await tx.get(`SELECT id FROM projects WHERE id = ?${db.rowLock}`, [project.id]);
          const code = await nextRetestCode(tx, project.id);
          return tx.get(
            `INSERT INTO retests (project_id, code, title, findings, requested_by, requested_at, status, notes, started_at, ended_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            [
              project.id,
              code,
              title,
              String(body.findings || ''),
              requestedBy,
              body.requestedAt ? String(body.requestedAt) : ts.slice(0, 10),
              retestStatus,
              String(body.notes || ''),
              retestDates.startedAt,
              retestDates.endedAt,
              ts,
              ts,
            ]
          );
        });
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === 9) throw err;
      }
    }

    // The project's own status is left alone. Raising a request used to flip a Done
    // engagement back to Ongoing "so it shows up as work again", which rewrote the
    // engagement's lifecycle behind the PM's back: closing a project and then
    // queueing a retest silently reopened it. The retest is what carries the open
    // work — its own status, its own row in the active lists (labelled
    // "Retest - <name>") and its own counter in the retest queue — so nothing is
    // hidden by leaving the project as it was. Only the timestamp moves, because
    // somebody touched it.
    await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [ts, project.id]);

    const retest = await db.get('SELECT * FROM retests WHERE id = ?', [Number(inserted.id)]);
    return { retest: shapeRetest(retest) };
  },

  'PATCH /api/retests/:id': async (ctx) => {
    const row = await db.get('SELECT * FROM retests WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Retest not found');
    const body = ctx.body || {};

    const nextStatus =
      body.status !== undefined
        ? await pickProperty('status', body.status, row.status)
        : row.status;
    // A retest follows exactly the same date rules as a project.
    const dates = resolveDates(body, row, nextStatus, row.status);

    await db.run(
      `UPDATE retests SET title = ?, findings = ?, requested_by = ?, requested_at = ?, status = ?, notes = ?, started_at = ?, ended_at = ?, updated_at = ?
        WHERE id = ?`,
      [
        body.title !== undefined ? String(body.title).trim() || row.title : row.title,
        body.findings !== undefined ? String(body.findings) : row.findings,
        body.requestedBy !== undefined ? String(body.requestedBy) : row.requested_by,
        body.requestedAt !== undefined ? String(body.requestedAt) || null : row.requested_at,
        nextStatus,
        body.notes !== undefined ? String(body.notes) : row.notes,
        dates.startedAt,
        dates.endedAt,
        nowISO(),
        row.id,
      ]
    );
    await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [nowISO(), row.project_id]);

    const retest = await db.get('SELECT * FROM retests WHERE id = ?', [row.id]);
    return { retest: shapeRetest(retest) };
  },

  'DELETE /api/retests/:id': async (ctx) => {
    requireDeleter(ctx, 'a retest request');
    const row = await db.get('SELECT * FROM retests WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Retest not found');
    await db.run('DELETE FROM retests WHERE id = ?', [row.id]);
    await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [nowISO(), row.project_id]);
    return { ok: true };
  },

  /* ============================================================
     clients + applications (Admin Panel catalogue)
     ============================================================ */
  'GET /api/clients': async () => {
    const rows = await db.all(
      `SELECT c.*,
              (SELECT COUNT(*) FROM applications a WHERE a.client_id = c.id) AS application_count,
              (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count
         FROM clients c
        ORDER BY c.name`
    );
    const managerMap = await managersByClient(rows.map((r) => Number(r.id)));
    return { clients: rows.map((r) => shapeClient(r, managerMap.get(Number(r.id)) || [])) };
  },

  'POST /api/clients': async (ctx) => {
    requireCatalogManager(ctx);
    const body = ctx.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw new HttpError(400, 'Client name is required');
    const exists = await db.get('SELECT id FROM clients WHERE LOWER(name) = LOWER(?)', [name]);
    if (exists) throw new HttpError(409, 'Client already exists');
    const row = await db.transaction(async (tx) => {
      const inserted = await tx.get(
        `INSERT INTO clients (name, short_name, notes, created_at) VALUES (?, ?, ?, ?) RETURNING id`,
        [name, String(body.shortName || '').trim(), String(body.notes || ''), nowISO()]
      );
      // A client names the project managers who usually handle it; the project
      // form pre-selects them when this client is picked.
      if (Array.isArray(body.managerIds)) {
        await setClientManagers(tx, Number(inserted.id), body.managerIds);
      }
      return inserted;
    });
    const created = await db.get(
      `SELECT c.*,
              (SELECT COUNT(*) FROM applications a WHERE a.client_id = c.id) AS application_count,
              (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count
         FROM clients c WHERE c.id = ?`,
      [Number(row.id)]
    );
    const managerMap = await managersByClient([Number(row.id)]);
    return { client: shapeClient(created, managerMap.get(Number(row.id)) || []) };
  },

  'PATCH /api/clients/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM clients WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Client not found');
    const body = ctx.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : row.name;
    if (!name) throw new HttpError(400, 'Client name is required');
    const clash = await db.get('SELECT id FROM clients WHERE LOWER(name) = LOWER(?) AND id <> ?', [
      name,
      row.id,
    ]);
    if (clash) throw new HttpError(409, 'Another client already uses that name');

    await db.transaction(async (tx) => {
      await tx.run('UPDATE clients SET name = ?, short_name = ?, notes = ? WHERE id = ?', [
        name,
        body.shortName !== undefined ? String(body.shortName).trim() : row.short_name,
        body.notes !== undefined ? String(body.notes) : row.notes,
        row.id,
      ]);
      // keep the denormalised copy on projects in sync
      if (name !== row.name) {
        await tx.run('UPDATE projects SET client = ? WHERE client_id = ?', [name, row.id]);
      }
      if (Array.isArray(body.managerIds)) {
        await setClientManagers(tx, Number(row.id), body.managerIds);
      }
    });

    const updated = await db.get(
      `SELECT c.*,
              (SELECT COUNT(*) FROM applications a WHERE a.client_id = c.id) AS application_count,
              (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count
         FROM clients c WHERE c.id = ?`,
      [row.id]
    );
    const managerMap = await managersByClient([Number(row.id)]);
    return { client: shapeClient(updated, managerMap.get(Number(row.id)) || []) };
  },

  'DELETE /api/clients/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM clients WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Client not found');
    const used = await db.get('SELECT COUNT(*) AS n FROM projects WHERE client_id = ?', [row.id]);
    if (Number(used.n) > 0) {
      throw new HttpError(
        409,
        `Cannot delete: ${used.n} project(s) still use this client. Reassign or delete them first.`
      );
    }
    // info_entries.scope_id cannot be a foreign key (it points at clients OR
    // applications depending on `scope`), so nothing cascades. Without this the
    // client's notes survive as unreachable rows: the target is gone from the
    // picker and GET /api/info 404s, so nobody can ever see or delete them.
    await db.transaction(async (tx) => {
      // The application ids MUST be read before the client row goes: applications
      // declare ON DELETE CASCADE, so deleting the client erases them first and a
      // later lookup returns nothing, silently leaking every application note.
      const apps = await tx.all('SELECT id FROM applications WHERE client_id = ?', [row.id]);
      for (const a of apps) {
        await tx.run("DELETE FROM info_entries WHERE scope = 'application' AND scope_id = ?", [
          Number(a.id),
        ]);
      }
      await tx.run("DELETE FROM info_entries WHERE scope = 'client' AND scope_id = ?", [row.id]);
      await tx.run('DELETE FROM clients WHERE id = ?', [row.id]);
    });
    return { ok: true };
  },

  'GET /api/applications': async (ctx) => {
    const { clientId } = ctx.query;
    const where = [];
    const params = [];
    if (clientId) {
      where.push('a.client_id = ?');
      params.push(Number(clientId));
    }
    const rows = await db.all(
      `SELECT a.*, (SELECT COUNT(*) FROM projects p WHERE p.application_id = a.id) AS project_count
         FROM applications a
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY a.name`,
      params
    );
    return { applications: rows.map(shapeApplication) };
  },

  'POST /api/applications': async (ctx) => {
    requireCatalogManager(ctx);
    const body = ctx.body || {};
    const name = String(body.name || '').trim();
    const clientId = Number(body.clientId);
    if (!name) throw new HttpError(400, 'Application name is required');
    if (!clientId) throw new HttpError(400, 'Client is required');
    const client = await db.get('SELECT id FROM clients WHERE id = ?', [clientId]);
    if (!client) throw new HttpError(400, 'Selected client does not exist');
    const clash = await db.get(
      'SELECT id FROM applications WHERE client_id = ? AND LOWER(name) = LOWER(?)',
      [clientId, name]
    );
    if (clash) throw new HttpError(409, 'That client already has an application with this name');

    const row = await db.get(
      `INSERT INTO applications (client_id, name, notes, created_at) VALUES (?, ?, ?, ?) RETURNING id`,
      [clientId, name, String(body.notes || ''), nowISO()]
    );
    const created = await db.get(
      `SELECT a.*, (SELECT COUNT(*) FROM projects p WHERE p.application_id = a.id) AS project_count
         FROM applications a WHERE a.id = ?`,
      [Number(row.id)]
    );
    return { application: shapeApplication(created) };
  },

  'PATCH /api/applications/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM applications WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Application not found');
    const body = ctx.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : row.name;
    if (!name) throw new HttpError(400, 'Application name is required');
    const clientId =
      body.clientId !== undefined ? Number(body.clientId) || row.client_id : row.client_id;
    const clash = await db.get(
      'SELECT id FROM applications WHERE client_id = ? AND LOWER(name) = LOWER(?) AND id <> ?',
      [clientId, name, row.id]
    );
    if (clash) throw new HttpError(409, 'That client already has an application with this name');

    await db.run('UPDATE applications SET client_id = ?, name = ?, notes = ? WHERE id = ?', [
      clientId,
      name,
      body.notes !== undefined ? String(body.notes) : row.notes,
      row.id,
    ]);
    const updated = await db.get(
      `SELECT a.*, (SELECT COUNT(*) FROM projects p WHERE p.application_id = a.id) AS project_count
         FROM applications a WHERE a.id = ?`,
      [row.id]
    );
    return { application: shapeApplication(updated) };
  },

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
              ac.name AS app_client_name
         FROM info_entries e
         LEFT JOIN users u ON u.id = e.created_by
         LEFT JOIN clients c ON e.scope = 'client' AND c.id = e.scope_id
         LEFT JOIN applications a ON e.scope = 'application' AND a.id = e.scope_id
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
        appName: entry.scope === 'application' ? row.app_name || '' : '',
      };
    });
    return { results, total: results.length };
  },

  'GET /api/info': async (ctx) => {
    const scope = String(ctx.query.scope || '');
    const scopeId = Number(ctx.query.scopeId);
    if (scope !== 'client' && scope !== 'application') {
      throw new HttpError(400, "Scope must be 'client' or 'application'");
    }
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
    if (scope !== 'client' && scope !== 'application') {
      throw new HttpError(400, "Scope must be 'client' or 'application'");
    }
    if (!scopeId) throw new HttpError(400, 'scopeId is required');
    await assertScopeExists(scope, scopeId);
    const env = documentEnv(scope, ctx.query.env);
    return { doc: await readDocument(scope, scopeId, env) };
  },

  'PATCH /api/docs/:scope/:scopeId': async (ctx) => {
    const scope = String(ctx.params.scope || '');
    const scopeId = Number(ctx.params.scopeId);
    if (scope !== 'client' && scope !== 'application') {
      throw new HttpError(400, "Scope must be 'client' or 'application'");
    }
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
    if (scope !== 'client' && scope !== 'application') {
      throw new HttpError(400, "Scope must be 'client' or 'application'");
    }
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
    // Pinning is a bookmark, not an edit: bumping updated_at for it would make
    // every pinned note claim "edited just now" and reshuffle the date order
    // under the user. Only a real content change moves the timestamp.
    const contentChanged =
      next.title !== row.title ||
      next.body !== row.body ||
      next.category !== row.category ||
      next.kind !== (row.kind || 'text') ||
      next.data !== (row.data || '');
    const stamp = contentChanged ? nowISO() : row.updated_at;
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

  'DELETE /api/applications/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM applications WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Application not found');
    const used = await db.get('SELECT COUNT(*) AS n FROM projects WHERE application_id = ?', [row.id]);
    if (Number(used.n) > 0) {
      throw new HttpError(
        409,
        `Cannot delete: ${used.n} project(s) still use this application. Reassign or delete them first.`
      );
    }
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM applications WHERE id = ?', [row.id]);
      await tx.run("DELETE FROM info_entries WHERE scope = 'application' AND scope_id = ?", [row.id]);
    });
    return { ok: true };
  },

  /* ---------- availability board ---------- */

  'GET /api/availability': async () => {
    const board = orderBoard(await buildBoard());
    const idle = board.filter((r) => r.status === 'Idle');
    return {
      board,
      totals: {
        people: board.length,
        idle: idle.length,
        onProject: board.filter((r) => r.status === 'On Project').length,
        unavailable: board.filter((r) => !r.automatic && r.status !== 'On Project' && r.status !== 'Idle')
          .length,
        // "There are also total idle" — this is the headline number, plus the
        // combined idle time so a manager can see the whole bench at a glance.
        idleDays: idle.reduce((sum, r) => sum + daysSince(r.idleSince), 0),
      },
    };
  },

  'PATCH /api/availability/:id': async (ctx) => {
    const id = Number(ctx.params.id);
    const row = await db.get(
      'SELECT id, username, name, role, subrole, parent_id, availability, availability_note FROM users WHERE id = ?',
      [id]
    );
    if (!row) throw new HttpError(404, 'Pentester not found');
    if (!canEditAvailability(ctx.user, row.id)) {
      throw new HttpError(403, 'You can only change your own availability');
    }
    const body = ctx.body || {};
    const next =
      body.status === undefined
        ? row.availability || ''
        : String(body.status || '').trim();
    if (!ENUMS.availability.includes(next)) {
      throw new HttpError(400, `Status must be one of: ${ENUMS.availability.filter(Boolean).join(', ')}`);
    }
    const note =
      body.note === undefined ? row.availability_note || '' : String(body.note || '').trim().slice(0, 280);
    await db.run('UPDATE users SET availability = ?, availability_note = ? WHERE id = ?', [
      next,
      note,
      id,
    ]);
    const board = orderBoard(await buildBoard());
    return { board, pentester: board.find((r) => r.id === id) || null };
  },

  /* ------------------------------------------------------------------
   * Board quick-assign: put a pentester on a project, or take them off it,
   * straight from the team board without opening the project form.
   * ------------------------------------------------------------------ */
  'POST /api/projects/:id/pentesters': async (ctx) => {
    requireCatalogManager(ctx);
    const projectId = Number(ctx.params.id);
    await assertProject(projectId);
    const userId = Number(ctx.body.userId);
    if (!userId) throw new HttpError(400, 'A pentester is required');
    const user = await db.get("SELECT id FROM users WHERE id = ? AND role = 'Pentester'", [userId]);
    if (!user) throw new HttpError(404, 'Pentester not found');
    const already = await db.get(
      'SELECT 1 AS ok FROM project_pentesters WHERE project_id = ? AND user_id = ?',
      [projectId, userId]
    );
    if (!already) {
      await db.run('INSERT INTO project_pentesters (project_id, user_id) VALUES (?, ?)', [
        projectId,
        userId,
      ]);
      await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [nowISO(), projectId]);
    }
    return { board: orderBoard(await buildBoard()) };
  },

  'DELETE /api/projects/:id/pentesters/:userId': async (ctx) => {
    requireCatalogManager(ctx);
    const projectId = Number(ctx.params.id);
    const userId = Number(ctx.params.userId);
    await assertProject(projectId);
    await db.run('DELETE FROM project_pentesters WHERE project_id = ? AND user_id = ?', [
      projectId,
      userId,
    ]);
    await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [nowISO(), projectId]);
    return { board: orderBoard(await buildBoard()) };
  },

  /* ---------- project manager management (Admin panel) ---------- */

  'POST /api/managers': async (ctx) => {
    requireCatalogManager(ctx);
    const body = ctx.body || {};
    const user = await createUser({
      username: body.username,
      name: body.name,
      password: body.password,
      role: 'Project Manager',
      // PMs sit outside the pentest tree, so no subrole/parent is validated.
      subrole: 'Member',
      parentId: null,
      phone: body.phone,
      email: body.email,
    });
    return { manager: user };
  },

  'PATCH /api/managers/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM users WHERE id = ?', [ctx.params.id]);
    if (!row || row.role !== 'Project Manager') throw new HttpError(404, 'Project manager not found');
    const body = ctx.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : row.name;
    if (!name) throw new HttpError(400, 'Name is required');
    await db.run('UPDATE users SET name = ?, phone = ?, email = ? WHERE id = ?', [
      name,
      body.phone !== undefined ? String(body.phone).trim() : row.phone || '',
      body.email !== undefined ? String(body.email).trim() : row.email || '',
      row.id,
    ]);
    return { manager: await getPublicUser(row.id) };
  },

  'DELETE /api/managers/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM users WHERE id = ?', [ctx.params.id]);
    if (!row || row.role !== 'Project Manager') throw new HttpError(404, 'Project manager not found');
    const owned = await db.get('SELECT COUNT(*) AS n FROM projects WHERE manager_id = ?', [row.id]);
    if (Number(owned.n) > 0) {
      throw new HttpError(
        409,
        `Cannot delete: ${owned.n} project(s) are still owned by this manager. Reassign them first.`
      );
    }
    await db.run('DELETE FROM users WHERE id = ?', [row.id]);
    return { ok: true };
  },

  /* ---------- pentester management (Admin panel) ---------- */

  'GET /api/pentesters': async (ctx) => {
    requireCatalogManager(ctx);
    // Project Managers are a separate role: they own engagements, they do not
    // test them, so they must never appear in the pentest hierarchy. Admins can
    // still carry a pentest subrole, so they stay in the tree as before.
    const users = (await listUsers()).map(shapePentester).filter((u) => u.role !== 'Project Manager');
    return { pentesters: users, tree: buildPentesterTree(users) };
  },

  'POST /api/pentesters': async (ctx) => {
    requireCatalogManager(ctx);
    const body = ctx.body || {};
    const subrole = ENUMS.subrole.includes(body.subrole) ? body.subrole : 'Member';
    const parentId = await validateParent(subrole, body.parentId);
    const user = await createUser({
      username: body.username,
      name: body.name,
      password: body.password,
      role: 'Pentester',
      subrole,
      parentId,
      phone: body.phone,
      email: body.email,
    });
    return { pentester: user };
  },

  'PATCH /api/pentesters/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM users WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Pentester not found');
    const body = ctx.body || {};

    const subrole = ENUMS.subrole.includes(body.subrole) ? body.subrole : row.subrole;
    // Re-validate the parent whenever either the level or the manager changes.
    const nextParent = body.parentId !== undefined ? body.parentId : row.parent_id;
    const parentId = await validateParent(subrole, nextParent, row.id);

    const name = body.name !== undefined ? String(body.name).trim() : row.name;
    if (!name) throw new HttpError(400, 'Name is required');

    await db.run(
      'UPDATE users SET name = ?, subrole = ?, parent_id = ?, phone = ?, email = ? WHERE id = ?',
      [
        name,
        subrole,
        parentId,
        body.phone !== undefined ? String(body.phone).trim() : row.phone || '',
        body.email !== undefined ? String(body.email).trim() : row.email || '',
        row.id,
      ]
    );
    return { pentester: await getPublicUser(row.id) };
  },

  'DELETE /api/pentesters/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM users WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Pentester not found');
    if (Number(row.id) === Number(ctx.user.id)) {
      throw new HttpError(400, 'You cannot remove your own account');
    }
    // Reassign anyone reporting to this person before removing them, otherwise
    // the tree silently loses a branch (ON DELETE SET NULL would orphan them).
    const reports = await db.all('SELECT id, name FROM users WHERE parent_id = ?', [row.id]);
    if (reports.length) {
      throw new HttpError(
        409,
        `${row.name} still manages ${reports.length} pentester(s). Move them to another manager first.`
      );
    }
    const assigned = await db.get(
      'SELECT COUNT(*) AS n FROM project_pentesters WHERE user_id = ?',
      [row.id]
    );
    await db.run('DELETE FROM users WHERE id = ?', [row.id]);
    return { ok: true, unassignedFrom: Number(assigned.n) };
  },

  /* ------------------------------------------------------------------
   * Devices — the hardware the team tests with.
   *
   * Four kinds, each with its OWN prescribed column set (DEVICE_FIELDS). Writes
   * are narrowed to the fields the kind owns, so switching a row from Android to
   * EDC cannot leave a `rom` value waiting to reappear if it is switched back,
   * and a typo'd field name is a hard error instead of a silent no-op.
   * ------------------------------------------------------------------ */

  'GET /api/devices': async (ctx) => {
    const kind = String(ctx.query.kind || '');
    if (kind && !DEVICE_KINDS.includes(kind)) {
      throw new HttpError(400, `Kind must be one of: ${DEVICE_KINDS.join(', ')}`);
    }
    const q = String(ctx.query.q || '').trim();
    const args = [];
    const where = [];
    if (kind) {
      where.push('kind = ?');
      args.push(kind);
    }
    if (q) {
      // Search spans every column because the user does not know which field a
      // serial number lives in — often they only remember the digit string. The
      // `extra` blob is searched as raw JSON text, which is enough to match a
      // user-added value without parsing every row in SQL.
      // Only the TEXT columns. `position` is an INTEGER, and LOWER() on an
      // integer is a hard error on Postgres (42883) even though SQLite quietly
      // accepts it — that mismatch made search 500 on Postgres only.
      const cols = Object.keys(DEVICE_COLUMNS)
        .map((k) => DEVICE_COLUMNS[k])
        .filter((c) => c !== 'position');
      where.push(`(${cols.map((c) => `LOWER(CAST(${c} AS TEXT)) LIKE ?`).join(' OR ')})`);
      for (let i = 0; i < cols.length; i += 1) args.push(`%${q.toLowerCase()}%`);
    }
    const rows = await db.all(
      // ORDER BY position first so a dragged order wins, then the alphabetical
      // default for rows that have never been reordered (position 0).
      `SELECT * FROM devices ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY position ASC, LOWER(name) ASC, id ASC`,
      args
    );
    // Per-kind totals come from their own query, NOT from `rows`: the tab strip
    // must keep showing how many devices each type holds even while one type is
    // selected or a search is filtering the visible list down to nothing.
    const counts = Object.fromEntries(DEVICE_KINDS.map((k) => [k, 0]));
    for (const r of await db.all('SELECT kind, COUNT(*) AS n FROM devices GROUP BY kind')) {
      counts[r.kind] = Number(r.n);
    }
    // The visible columns for the requested kind. Every kind's config is sent so
    // the client can render a tab strip without another round trip.
    const columns = {};
    for (const k of DEVICE_KINDS) {
      columns[k] = (await ensureColumns(null, k)).map(shapeColumn);
    }
    return {
      devices: rows.map(shapeDevice),
      counts,
      columns,
      fields: DEVICE_FIELDS,
      labels: DEVICE_LABELS,
      kinds: DEVICE_KINDS,
    };
  },

  /**
   * Column configuration for one kind: add, rename, reorder, hide, delete.
   *
   * One endpoint handles all of them because they are the same operation on the
   * same list, and the client always has the full list in hand — sending the
   * whole arrangement is idempotent, whereas a per-change endpoint would have to
   * guess the resulting order.
   */
  'PATCH /api/devices/columns/:kind': async (ctx) => {
    const kind = String(ctx.params.kind || '');
    if (!DEVICE_KINDS.includes(kind)) {
      throw new HttpError(400, `Kind must be one of: ${DEVICE_KINDS.join(', ')}`);
    }
    const body = ctx.body || {};
    if (!Array.isArray(body.columns)) throw new HttpError(400, 'columns must be an array');
    const incoming = body.columns;
    if (!incoming.length) throw new HttpError(400, 'A type needs at least one column');

    const seen = new Set();
    for (const c of incoming) {
      const key = String(c?.key || '').trim();
      if (!key) throw new HttpError(400, 'Every column needs a key');
      if (seen.has(key)) throw new HttpError(400, `Duplicate column key: ${key}`);
      seen.add(key);
      if (!String(c?.label || '').trim()) throw new HttpError(400, 'Every column needs a label');
    }

    await db.transaction(async (tx) => {
      const existing = await ensureColumns(tx, kind);
      const byKey = new Map(existing.map((c) => [c.key, c]));
      const keep = new Set();
      let pos = 0;
      for (const c of incoming) {
        const key = String(c.key).trim();
        const label = String(c.label).trim().slice(0, 60);
        const hidden = c.hidden ? 1 : 0;
        keep.add(key);
        const prev = byKey.get(key);
        if (prev) {
          // A prescribed column keeps its builtin flag: it may be hidden or
          // renamed but the form still knows to write it to a real DB column.
          await tx.run('UPDATE device_columns SET label = ?, position = ?, hidden = ? WHERE id = ?', [
            label,
            pos++,
            hidden,
            prev.id,
          ]);
        } else {
          // A key that collides with a built-in DB field must reuse that field
          // rather than becoming a second, shadow copy of it.
          const builtin = !!DEVICE_COLUMNS[key];
          await tx.run(
            'INSERT INTO device_columns (kind, key, label, position, hidden, builtin) VALUES (?, ?, ?, ?, ?, ?)',
            [kind, key, label, pos++, hidden, builtin ? 1 : 0]
          );
        }
      }
      // Anything the client no longer lists is deleted. User-added cells for that
      // column are dropped from every row so a later column reusing the key cannot
      // inherit stale values.
      //
      // That purge is a delete, so it takes the delete rule: a pentester may add,
      // rename, hide and reorder columns (they own the sheet), but taking a column
      // — and every value in it — away is a lead's decision. Checked before the
      // first destructive statement, so a refused request changes nothing.
      if (existing.some((c) => !keep.has(c.key))) requireDeleter(ctx, 'a device column');
      for (const c of existing) {
        if (keep.has(c.key)) continue;
        await tx.run('DELETE FROM device_columns WHERE id = ?', [c.id]);
        if (!c.builtin) {
          for (const row of await tx.all('SELECT id, extra FROM devices WHERE kind = ?', [kind])) {
            const extra = parseExtra(row.extra);
            if (!(c.key in extra)) continue;
            delete extra[c.key];
            await tx.run('UPDATE devices SET extra = ? WHERE id = ?', [JSON.stringify(extra), row.id]);
          }
        }
      }
    });

    return { columns: (await ensureColumns(null, kind)).map(shapeColumn) };
  },

  /** Persist a dragged row order for one kind. */
  'PATCH /api/devices/order': async (ctx) => {
    const body = ctx.body || {};
    const kind = String(body.kind || '');
    if (!DEVICE_KINDS.includes(kind)) {
      throw new HttpError(400, `Kind must be one of: ${DEVICE_KINDS.join(', ')}`);
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    if (!ids.length) throw new HttpError(400, 'ids must be a non-empty array');
    await db.transaction(async (tx) => {
      // Only rows of this kind may be reordered, so a stray id from another tab
      // cannot be silently moved to the top of its own list.
      const rows = await tx.all('SELECT id FROM devices WHERE kind = ?', [kind]);
      const allowed = new Set(rows.map((r) => Number(r.id)));
      let pos = 0;
      for (const id of ids) {
        if (!allowed.has(id)) continue;
        await tx.run('UPDATE devices SET position = ? WHERE id = ?', [pos++, id]);
      }
    });
    return { ok: true };
  },

  'POST /api/devices': async (ctx) => {
    const body = ctx.body || {};
    const kind = String(body.kind || 'Android');
    if (!DEVICE_KINDS.includes(kind)) {
      throw new HttpError(400, `Kind must be one of: ${DEVICE_KINDS.join(', ')}`);
    }
    const columns = await ensureColumns(null, kind);
    const values = collectDeviceFields(kind, body, null, columns);
    if (!values.name.trim()) throw new HttpError(400, 'Device name is required');
    const created = await db.get(
      `INSERT INTO devices (kind, ${Object.keys(values).map((k) => DEVICE_COLUMNS[k]).join(', ')}, created_at, updated_at)
       VALUES (?, ${Object.keys(values).map(() => '?').join(', ')}, ?, ?) RETURNING id`,
      [kind, ...Object.values(values), nowISO(), nowISO()]
    );
    return { device: await readDevice(Number(created.id)) };
  },

  'PATCH /api/devices/:id': async (ctx) => {
    const row = await db.get('SELECT * FROM devices WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Device not found');
    const body = ctx.body || {};
    // A kind change is allowed (a device was mis-filed), but then only the NEW
    // kind's fields survive: keeping the old ones would store values the UI
    // never shows.
    const kind = body.kind !== undefined ? String(body.kind) : row.kind;
    if (!DEVICE_KINDS.includes(kind)) {
      throw new HttpError(400, `Kind must be one of: ${DEVICE_KINDS.join(', ')}`);
    }
    const columns = await ensureColumns(null, kind);
    const current = shapeDevice(row);
    const values = collectDeviceFields(kind, body, current, columns);
    if (!String(values.name || '').trim()) throw new HttpError(400, 'Device name is required');
    await db.run(
      `UPDATE devices SET kind = ?, ${Object.keys(values).map((k) => `${DEVICE_COLUMNS[k]} = ?`).join(', ')},
         updated_at = ? WHERE id = ?`,
      [kind, ...Object.values(values), nowISO(), row.id]
    );
    return { device: await readDevice(Number(row.id)) };
  },

  'PATCH /api/devices/bulk': async (ctx) => {
    const body = ctx.body || {};
    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (!updates.length) throw new HttpError(400, 'updates must be a non-empty array');
    if (updates.length > 500) throw new HttpError(400, 'Too many rows in one save (max 500)');

    // Bulk edit is a convenience over the single-row route, not a different
    // contract: each row is validated exactly as a PATCH /api/devices/:id would
    // be, and the whole batch is rejected if any row is bad. A partial save would
    // leave the sheet half-updated with no way to tell which cells landed.
    const prepared = [];
    const seen = new Set();
    for (const raw of updates) {
      const id = Number(raw?.id);
      if (!id) throw new HttpError(400, 'Every update needs an id');
      if (seen.has(id)) throw new HttpError(400, 'Duplicate device id in one save');
      seen.add(id);
      const row = await db.get('SELECT * FROM devices WHERE id = ?', [id]);
      if (!row) throw new HttpError(404, `Device ${id} not found`);
      const kind = raw.kind !== undefined ? String(raw.kind) : row.kind;
      if (!DEVICE_KINDS.includes(kind)) {
        throw new HttpError(400, `Kind must be one of: ${DEVICE_KINDS.join(', ')}`);
      }
      const columns = await ensureColumns(null, kind);
      const values = collectDeviceFields(kind, raw, shapeDevice(row), columns);
      if (!String(values.name || '').trim()) {
        // Name the offending row: "Device name is required" alone is useless when
        // twenty rows are on screen and one of them was blanked by a stray keypress.
        throw new HttpError(400, `Device name is required (row ${row.id})`);
      }
      prepared.push({ id: row.id, kind, values });
    }

    for (const p of prepared) {
      await db.run(
        `UPDATE devices SET kind = ?, ${Object.keys(p.values)
          .map((k) => `${DEVICE_COLUMNS[k]} = ?`)
          .join(', ')}, updated_at = ? WHERE id = ?`,
        [p.kind, ...Object.values(p.values), nowISO(), p.id]
      );
    }
    const devices = [];
    for (const p of prepared) devices.push(await readDevice(p.id));
    return { devices, updated: prepared.length };
  },

  'DELETE /api/devices/:id': async (ctx) => {
    requireDeleter(ctx, 'a device');
    const row = await db.get('SELECT id FROM devices WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Device not found');
    await db.run('DELETE FROM devices WHERE id = ?', [row.id]);
    return { ok: true };
  },
};
