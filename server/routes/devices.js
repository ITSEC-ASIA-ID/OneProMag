import { requireDeleter } from '../shared.js';
import {
  db,
  DEVICE_FIELDS,
  DEVICE_LABELS,
  DEVICE_COLUMNS,
  DEVICE_KINDS
} from '../db.js';
import { HttpError, nowISO } from '../auth.js';


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


/* ============================================================
   routes
   ============================================================ */
export const routes = {

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
