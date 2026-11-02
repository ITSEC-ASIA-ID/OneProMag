import {
  assertProject,
  canSupervise,
  editStamp,
  getProjectRaw,
  projectSelect,
  propertyKeys,
  requireDeleter,
  retestOpen
} from '../shared.js';
import { db, ENUMS } from '../db.js';
import { HttpError, nowISO } from '../auth.js';


const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);


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


/**
 * True when the posted test bench differs from the stored one. Compared here
 * rather than through `editStamp` because the team lives in its own table, not
 * in a column that statement writes.
 */
async function pentestersDiffer(tx, projectId, userIds) {
  const stored = (
    await tx.all('SELECT user_id FROM project_pentesters WHERE project_id = ?', [projectId])
  )
    .map((r) => Number(r.user_id))
    .sort((a, b) => a - b);
  const wanted = [...new Set((userIds || []).map(Number).filter(Boolean))].sort((a, b) => a - b);
  return stored.length !== wanted.length || stored.some((id, i) => id !== wanted[i]);
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
    // Optional third level: Client → Application → Variant. Empty on most projects.
    variantId: row.variant_id ?? null,
    variantName: row.variant_name || '',
    // One project supervisor per project. The name/email/phone are joined in
    // projectSelect so the list, table and drawer never need an extra request.
    supervisorId: row.supervisor_id ?? null,
    supervisorName: row.supervisor_name || '',
    supervisorEmail: row.supervisor_email || '',
    supervisorPhone: row.supervisor_phone || '',
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


/** Validates a project's supervisor: a Supervisor account, a pentester, or nobody. */
async function resolveSupervisorId(tx, value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  const row = await tx.get('SELECT id, role FROM users WHERE id = ?', [id]);
  if (!row) throw new HttpError(400, 'Selected supervisor does not exist');
  if (!canSupervise(row)) {
    throw new HttpError(400, 'A supervisor must be a project manager or a pentester');
  }
  return id;
}


/** A project's variant must exist AND belong to the application it is filed under. */
async function resolveVariantId(tx, value, applicationId) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  const row = await tx.get('SELECT id, application_id FROM application_variants WHERE id = ?', [id]);
  if (!row) throw new HttpError(400, 'Selected variant app does not exist');
  if (applicationId && Number(row.application_id) !== Number(applicationId)) {
    throw new HttpError(400, 'That variant belongs to a different application');
  }
  return id;
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
    // project supervisor or an admin could be written into project_pentesters by
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

  /* The optional third level: a variant of THIS application.
     - no application  -> no variant can be meant, so it is cleared
     - application changed without naming a variant -> the old variant belonged to
       the old application, so it is cleared rather than silently kept
     - a variant is named -> it has to exist and belong to this application */
  let variantId =
    existing && Number(existing.application_id) === Number(applicationId)
      ? existing.variant_id ?? null
      : null;
  if (body.variantId !== undefined) {
    variantId = body.variantId === null || body.variantId === '' ? null : Number(body.variantId);
  }
  variantId = await resolveVariantId(tx, variantId, applicationId);

  return { clientId, applicationId, clientName, variantId };
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


function isUniqueViolation(err) {
  // Postgres: 23505. SQLite: "UNIQUE constraint failed".
  return err?.code === '23505' || /UNIQUE constraint failed/i.test(String(err?.message || ''));
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


/* ============================================================
   routes
   ============================================================ */
export const routes = {

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

      const supervisorId = await resolveSupervisorId(tx, body.supervisorId);
      const row = await tx.get(
        `INSERT INTO projects (name, client, client_id, application_id, variant_id, supervisor_id, category, platform, env, method, status, notes, started_at, ended_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
          name,
          ref.clientName,
          ref.clientId,
          ref.applicationId,
          ref.variantId,
          supervisorId,
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
      const supervisorId =
        body.supervisorId !== undefined ? await resolveSupervisorId(tx, body.supervisorId) : row.supervisor_id ?? null;

      const next = {
        name,
        client: ref.clientName,
        client_id: ref.clientId,
        application_id: ref.applicationId,
        variant_id: ref.variantId,
        supervisor_id: supervisorId,
        category,
        platform,
        env: body.env !== undefined ? pick(body.env, ENUMS.env, row.env) : row.env,
        method: body.method !== undefined ? pick(body.method, ENUMS.method, row.method) : row.method,
        status: nextStatus,
        notes: body.notes !== undefined ? String(body.notes) : row.notes,
        started_at: dates.startedAt,
        ended_at: dates.endedAt,
      };
      // The bench is written by a separate statement, so `next` cannot see it.
      // Left out, adding somebody to the team would leave the project claiming it
      // was last touched days ago — the dedicated assign routes do stamp.
      const teamChanged = Array.isArray(body.pentesterIds)
        ? await pentestersDiffer(tx, row.id, body.pentesterIds)
        : false;

      await tx.run(
        `UPDATE projects SET ${Object.keys(next).map((c) => `${c} = ?`).join(', ')}, updated_at = ?
          WHERE id = ?`,
        [...Object.values(next), teamChanged ? nowISO() : editStamp(row, next), row.id]
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
    // engagement's lifecycle behind the SV's back: closing a project and then
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

    const next = {
      title: body.title !== undefined ? String(body.title).trim() || row.title : row.title,
      findings: body.findings !== undefined ? String(body.findings) : row.findings,
      requested_by: body.requestedBy !== undefined ? String(body.requestedBy) : row.requested_by,
      requested_at: body.requestedAt !== undefined ? String(body.requestedAt) || null : row.requested_at,
      status: nextStatus,
      notes: body.notes !== undefined ? String(body.notes) : row.notes,
      started_at: dates.startedAt,
      ended_at: dates.endedAt,
    };
    const stamp = editStamp(row, next);
    await db.run(
      `UPDATE retests SET ${Object.keys(next).map((c) => `${c} = ?`).join(', ')}, updated_at = ?
        WHERE id = ?`,
      [...Object.values(next), stamp, row.id]
    );
    // The project's stamp follows the retest's rather than being written
    // unconditionally, or an unchanged save would reshuffle the project list too.
    if (stamp !== row.updated_at) {
      await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [stamp, row.project_id]);
    }

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
};
