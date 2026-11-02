import {
  canSupervise,
  clearPropertyCache,
  properties,
  propertyKeys,
  requireCatalogManager,
  requireDeleter
} from '../shared.js';
import { db } from '../db.js';
import { HttpError, nowISO } from '../auth.js';


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


function shapeClient(row, supervisors = []) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    applicationCount: Number(row.application_count ?? 0),
    projectCount: Number(row.project_count ?? 0),
    // The SVs who usually handle this client, used to pre-fill the project form.
    supervisors,
  };
}


/**
 * Project supervisors of the given clients, grouped into a Map.
 * Same N+1-avoiding shape as pentestersByProject().
 */
async function supervisorsByClient(clientIds) {
  const map = new Map();
  if (!clientIds.length) return map;
  const placeholders = clientIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT cm.client_id, u.id, u.name, u.email, u.phone
       FROM client_supervisors cm
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


/** Replaces the default-supervisor set of one client. */
async function setClientSupervisors(tx, clientId, userIds) {
  await tx.run('DELETE FROM client_supervisors WHERE client_id = ?', [clientId]);
  const unique = [...new Set((userIds || []).map(Number).filter(Boolean))];
  for (const uid of unique) {
    const exists = await tx.get('SELECT id, role FROM users WHERE id = ?', [uid]);
    // Silently skipping anyone who cannot supervise keeps the request forgiving; the
    // UI only ever offers the pool anyway.
    if (canSupervise(exists)) {
      await tx.run('INSERT INTO client_supervisors (client_id, user_id) VALUES (?, ?)', [clientId, uid]);
    }
  }
}


function shapeApplication(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    notes: row.notes || '',
    createdAt: row.created_at,
    projectCount: Number(row.project_count ?? 0),
    // Filled in by withVariants(): a variant only ever means something as a child
    // of its application, so it is shaped here rather than as a free list.
    variants: [],
  };
}


function shapeVariant(row) {
  return {
    id: Number(row.id),
    applicationId: Number(row.application_id),
    name: row.name,
    notes: row.notes || '',
    createdAt: row.created_at,
    projectCount: Number(row.project_count ?? 0),
  };
}


/**
 * The editable half of a variant: a name and free notes, nothing else. The name is
 * whatever the team calls that product ("Brilink MPOS"); asking for a package name
 * and a version to describe it was inventing work nobody asked for.
 */
function variantFields(body, row = {}) {
  return {
    notes: body.notes === undefined ? row.notes ?? '' : String(body.notes),
  };
}


/**
 * Attaches each application's variants to it, in one query.
 *
 * Two queries, not one per application: the client page lists every application of
 * every client, and N+1 there is the difference between a page and a wait.
 */
async function withVariants(applications) {
  if (!applications.length) return applications;
  const rows = await db.all(
    `SELECT v.*, (SELECT COUNT(*) FROM projects p WHERE p.variant_id = v.id) AS project_count
       FROM application_variants v
      ORDER BY v.name`
  );
  const byApp = new Map();
  for (const row of rows) {
    const key = Number(row.application_id);
    if (!byApp.has(key)) byApp.set(key, []);
    byApp.get(key).push(shapeVariant(row));
  }
  for (const app of applications) app.variants = byApp.get(Number(app.id)) || [];
  return applications;
}


/**
 * Deletes the notes and the fixed sheets of a set of targets.
 *
 * `info_entries.scope_id` and `documents.scope_id` cannot be foreign keys (they
 * point at a client OR an application OR a variant depending on `scope`), so
 * nothing cascades. Without this the rows survive as unreachable litter: the target
 * is gone from the picker and `GET /api/info` 404s, so nobody can ever see or
 * delete them again.
 */
async function purgeInfoFor(tx, scope, ids) {
  const list = (ids || []).map(Number).filter(Boolean);
  if (!list.length) return;
  const marks = list.map(() => '?').join(',');
  for (const table of ['info_entries', 'documents']) {
    await tx.run(`DELETE FROM ${table} WHERE scope = ? AND scope_id IN (${marks})`, [scope, ...list]);
  }
}


/* ============================================================
   routes
   ============================================================ */
export const routes = {

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
   * refused too, with the count — the same rule as deleting a client or a supervisor.
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
    const supervisorMap = await supervisorsByClient(rows.map((r) => Number(r.id)));
    return { clients: rows.map((r) => shapeClient(r, supervisorMap.get(Number(r.id)) || [])) };
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
      // A client names the project supervisors who usually handle it; the project
      // form pre-selects them when this client is picked.
      if (Array.isArray(body.supervisorIds)) {
        await setClientSupervisors(tx, Number(inserted.id), body.supervisorIds);
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
    const supervisorMap = await supervisorsByClient([Number(row.id)]);
    return { client: shapeClient(created, supervisorMap.get(Number(row.id)) || []) };
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
      // keep the denormalised copy on projects in sync. This writes the client
      // NAME onto every project pointing here, which is text the project list
      // renders — so the row's timestamp has to move with it. Leaving it alone
      // made a renamed project look untouched for days.
      if (name !== row.name) {
        await tx.run('UPDATE projects SET client = ?, updated_at = ? WHERE client_id = ?', [
          name,
          nowISO(),
          row.id,
        ]);
      }
      if (Array.isArray(body.supervisorIds)) {
        await setClientSupervisors(tx, Number(row.id), body.supervisorIds);
      }
    });

    const updated = await db.get(
      `SELECT c.*,
              (SELECT COUNT(*) FROM applications a WHERE a.client_id = c.id) AS application_count,
              (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count
         FROM clients c WHERE c.id = ?`,
      [row.id]
    );
    const supervisorMap = await supervisorsByClient([Number(row.id)]);
    return { client: shapeClient(updated, supervisorMap.get(Number(row.id)) || []) };
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
    await db.transaction(async (tx) => {
      // The child ids MUST be read before the client row goes: applications and
      // variants declare ON DELETE CASCADE, so deleting the client erases them
      // first and a later lookup returns nothing, silently leaking their notes.
      const apps = await tx.all('SELECT id FROM applications WHERE client_id = ?', [row.id]);
      const appIds = apps.map((a) => Number(a.id));
      const variants = appIds.length
        ? await tx.all(
            `SELECT id FROM application_variants WHERE application_id IN (${appIds
              .map(() => '?')
              .join(',')})`,
            appIds
          )
        : [];
      await tx.run('DELETE FROM clients WHERE id = ?', [row.id]);
      await purgeInfoFor(tx, 'client', [row.id]);
      await purgeInfoFor(tx, 'application', appIds);
      await purgeInfoFor(
        tx,
        'variant',
        variants.map((v) => Number(v.id))
      );
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
    return { applications: await withVariants(rows.map(shapeApplication)) };
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
    return { application: (await withVariants([shapeApplication(created)]))[0] };
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
    return { application: (await withVariants([shapeApplication(updated)]))[0] };
  },


  /* ---------- variant apps (Client → Application → Variant) ----------
     A variant is a child of ONE application: the same product shipped in several
     shapes (an Android build, an iOS build, a partner-branded build). Creating and
     renaming is a tester's tool like every other create/edit; deleting is a delete,
     so it follows the same rule as the rest of the app (admin, lead or sub lead). */

  'GET /api/variants': async (ctx) => {
    const appId = ctx.query.applicationId ? Number(ctx.query.applicationId) : null;
    const rows = await db.all(
      `SELECT v.*, (SELECT COUNT(*) FROM projects p WHERE p.variant_id = v.id) AS project_count
         FROM application_variants v
        ${appId ? 'WHERE v.application_id = ?' : ''}
        ORDER BY v.name`,
      appId ? [appId] : []
    );
    return { variants: rows.map(shapeVariant) };
  },


  'POST /api/applications/:id/variants': async (ctx) => {
    requireCatalogManager(ctx);
    const applicationId = Number(ctx.params.id);
    const app = await db.get('SELECT id FROM applications WHERE id = ?', [applicationId]);
    if (!app) throw new HttpError(404, 'Application not found');
    const name = String((ctx.body || {}).name || '').trim();
    if (!name) throw new HttpError(400, 'Variant name is required');
    const clash = await db.get(
      'SELECT id FROM application_variants WHERE application_id = ? AND LOWER(name) = LOWER(?)',
      [applicationId, name]
    );
    if (clash) throw new HttpError(409, 'That application already has a variant with this name');

    const row = await db.get(
      `INSERT INTO application_variants (application_id, name, notes, created_at)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [applicationId, name, variantFields(ctx.body || {}).notes, nowISO()]
    );
    const created = await db.get(
      `SELECT v.*, 0 AS project_count FROM application_variants v WHERE v.id = ?`,
      [Number(row.id)]
    );
    return { variant: shapeVariant(created) };
  },


  'PATCH /api/variants/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM application_variants WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Variant app not found');
    const body = ctx.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : row.name;
    if (!name) throw new HttpError(400, 'Variant name is required');
    const clash = await db.get(
      'SELECT id FROM application_variants WHERE application_id = ? AND LOWER(name) = LOWER(?) AND id <> ?',
      [row.application_id, name, row.id]
    );
    if (clash) throw new HttpError(409, 'That application already has a variant with this name');

    await db.run('UPDATE application_variants SET name = ?, notes = ? WHERE id = ?', [
      name,
      variantFields(body, row).notes,
      row.id,
    ]);
    const updated = await db.get(
      `SELECT v.*, (SELECT COUNT(*) FROM projects p WHERE p.variant_id = v.id) AS project_count
         FROM application_variants v WHERE v.id = ?`,
      [row.id]
    );
    return { variant: shapeVariant(updated) };
  },


  'DELETE /api/variants/:id': async (ctx) => {
    // Dropping a variant unfiles every project that pointed at it, which is a
    // delete in every sense the app cares about.
    requireDeleter(ctx, 'a variant app');
    const row = await db.get('SELECT * FROM application_variants WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Variant app not found');
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM application_variants WHERE id = ?', [row.id]);
      await purgeInfoFor(tx, 'variant', [row.id]);
    });
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
      // The variant ids have to be read first: application_variants declares
      // ON DELETE CASCADE, so after the application row goes there is nothing left
      // to look up and every variant note would leak.
      const variants = await tx.all('SELECT id FROM application_variants WHERE application_id = ?', [
        row.id,
      ]);
      await tx.run('DELETE FROM applications WHERE id = ?', [row.id]);
      await purgeInfoFor(tx, 'application', [row.id]);
      await purgeInfoFor(
        tx,
        'variant',
        variants.map((v) => Number(v.id))
      );
    });
    return { ok: true };
  },
};
