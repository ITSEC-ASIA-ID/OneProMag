import { db } from '../db.js';
import { HttpError, nowISO } from '../auth.js';
import { assertProject, requireCatalogManager, requireDeleter } from '../shared.js';

/* Security checklists, in two halves that live in one file because they cannot
 * be understood apart:
 *
 *   the catalogue  — checklists + checklist_items, edited in the Admin panel
 *   the engagement — project_checklists (a link) + project_checklist_items (answers)
 *
 * A project LINKS a template rather than copying its text, so fixing a typo fixes
 * it everywhere. The price is that editing mid-engagement changes what an old
 * project shows; this app tracks engagements, it does not certify them. The same
 * decision is why `project_checklists.checklist_id` is ON DELETE RESTRICT: a
 * cascade would silently erase somebody's completed work. */

export const CHECKLIST_STATUS = ['Open', 'Pass', 'Fail', 'N/A'];

/** `projects.category` values, plus '' for a template that fits any of them. */
export const CHECKLIST_CATEGORIES = ['', 'Web', 'Mobile', 'API', 'EDC'];

const OPEN = 'Open';

function wantedCategory(value) {
  const raw = String(value ?? '').trim();
  const match = CHECKLIST_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (match === undefined) {
    throw new HttpError(400, `Unknown category: ${raw} — pick one of ${CHECKLIST_CATEGORIES.filter(Boolean).join(', ')}`);
  }
  return match;
}

/**
 * One default per category: the whole point is that a project's category
 * answers "which checklist am I measured against", and two defaults would make
 * that answer depend on row order.
 */
async function claimDefault(conn, category, exceptId) {
  if (category === '') {
    throw new HttpError(400, 'Set a category before making a checklist the default');
  }
  await conn.run(
    'UPDATE checklists SET is_default = FALSE WHERE category = ? AND id <> ?',
    [category, Number(exceptId)]
  );
}

function text(value, max = 300) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

function wanted(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new HttpError(400, 'This field is required');
  return text(raw);
}

function shapeItem(row) {
  return {
    id: Number(row.id),
    checklistId: Number(row.checklist_id),
    section: row.section || '',
    title: row.title,
    help: row.help || '',
    position: Number(row.position || 0),
  };
}

function shapeChecklist(row) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description || '',
    category: row.category || '',
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    itemCount: row.item_count === undefined ? undefined : Number(row.item_count),
    projectCount: row.project_count === undefined ? undefined : Number(row.project_count),
  };
}

async function checklistRow(id) {
  const row = await db.get(
    `SELECT c.*,
            (SELECT COUNT(*) FROM checklist_items i WHERE i.checklist_id = c.id) AS item_count,
            (SELECT COUNT(*) FROM project_checklists pc WHERE pc.checklist_id = c.id) AS project_count
       FROM checklists c
      WHERE c.id = ?`,
    [id]
  );
  if (!row) throw new HttpError(404, 'Checklist not found');
  return row;
}

async function itemRow(id) {
  const row = await db.get('SELECT * FROM checklist_items WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, 'Checklist item not found');
  return row;
}

async function assertUniqueName(name, exceptId = null) {
  const clash = await db.get('SELECT id FROM checklists WHERE name = ?', [name]);
  if (clash && Number(clash.id) !== Number(exceptId)) {
    throw new HttpError(409, `A checklist called "${name}" already exists`);
  }
}

/** `12 / 34 answered · 3 fail` — the numbers the drawer prints. */
function progressOf(items, answers) {
  const byItem = new Map(answers.map((a) => [Number(a.item_id), a]));
  let answered = 0;
  let pass = 0;
  let fail = 0;
  let na = 0;
  for (const item of items) {
    const answer = byItem.get(Number(item.id));
    const status = answer ? answer.status : OPEN;
    if (status !== OPEN) answered += 1;
    if (status === 'Pass') pass += 1;
    else if (status === 'Fail') fail += 1;
    else if (status === 'N/A') na += 1;
  }
  return { total: items.length, answered, pass, fail, na, open: items.length - answered };
}

/** The whole engagement view: attached templates, their items, the answers. */
async function projectChecklists(projectId) {
  const attached = await db.all(
    `SELECT pc.id, pc.checklist_id, pc.created_at, c.name, c.description,
            c.category, c.is_default
       FROM project_checklists pc
       JOIN checklists c ON c.id = pc.checklist_id
      WHERE pc.project_id = ?
      ORDER BY c.name`,
    [projectId]
  );
  if (!attached.length) return [];

  const ids = attached.map((a) => Number(a.checklist_id));
  const holes = ids.map(() => '?').join(', ');
  const items = await db.all(
    `SELECT * FROM checklist_items WHERE checklist_id IN (${holes}) ORDER BY position, id`,
    ids
  );
  const answers = await db.all(
    `SELECT pci.item_id, pci.status, pci.note, pci.file_id, pci.updated_at,
            u.name AS updated_by_name
       FROM project_checklist_items pci
       JOIN project_checklists pc ON pc.id = pci.project_checklist_id
       LEFT JOIN users u ON u.id = pci.updated_by
      WHERE pc.project_id = ?`,
    [projectId]
  );

  const answerByItem = new Map(answers.map((a) => [Number(a.item_id), a]));
  return attached.map((link) => {
    const mine = items.filter((i) => Number(i.checklist_id) === Number(link.checklist_id));
    return {
      id: Number(link.id),
      checklistId: Number(link.checklist_id),
      name: link.name,
      description: link.description || '',
      category: link.category || '',
      isDefault: Boolean(link.is_default),
      createdAt: link.created_at,
      progress: progressOf(mine, answers),
      items: mine.map((item) => {
        const answer = answerByItem.get(Number(item.id));
        return {
          ...shapeItem(item),
          status: answer ? answer.status : OPEN,
          note: answer ? answer.note : '',
          fileId: answer && answer.file_id ? Number(answer.file_id) : null,
          updatedAt: answer ? answer.updated_at : '',
          updatedByName: (answer && answer.updated_by_name) || '',
        };
      }),
    };
  });
}

/** "OWASP Top 10 2021 · A01 — Broken Access Control" for the notes breadcrumb. */
async function itemLabel(itemId) {
  return db.get(
    `SELECT i.id, i.title, i.section, c.id AS checklist_id, c.name AS checklist_name
       FROM checklist_items i
       JOIN checklists c ON c.id = i.checklist_id
      WHERE i.id = ?`,
    [itemId]
  );
}

/**
 * Attaches the default template of a category, if there is one and it is not
 * already on the project. Called when a project is written with a category, so
 * choosing "API" is enough to get the API checklist — while any other template
 * can still be attached by hand, and nothing is ever detached implicitly.
 *
 * Returns the ids it attached, so the caller can say what happened.
 */
export async function attachCategoryDefaults(conn, projectId, category) {
  const key = String(category || '').trim();
  if (!key) return [];
  const defaults = await conn.all(
    'SELECT id FROM checklists WHERE category = ? AND is_default = TRUE',
    [key]
  );
  const attached = [];
  for (const row of defaults) {
    const exists = await conn.get(
      'SELECT id FROM project_checklists WHERE project_id = ? AND checklist_id = ?',
      [projectId, row.id]
    );
    if (exists) continue;
    await conn.run(
      'INSERT INTO project_checklists (project_id, checklist_id, created_at) VALUES (?, ?, ?)',
      [projectId, row.id, nowISO()]
    );
    attached.push(Number(row.id));
  }
  return attached;
}

export const routes = {
  'GET /api/checklists': async (ctx) => {
    const filter = ctx.query && ctx.query.category;
    const where = filter === undefined ? '' : 'WHERE c.category IN (?, \'\')';
    const rows = await db.all(
      `SELECT c.*,
              (SELECT COUNT(*) FROM checklist_items i WHERE i.checklist_id = c.id) AS item_count,
              (SELECT COUNT(*) FROM project_checklists pc WHERE pc.checklist_id = c.id) AS project_count
         FROM checklists c
        ${where}
        ORDER BY c.is_default DESC, c.name`,
      filter === undefined ? [] : [wantedCategory(filter)]
    );
    return { checklists: rows.map(shapeChecklist) };
  },

  'GET /api/checklists/:id': async (ctx) => {
    const row = await checklistRow(ctx.params.id);
    const items = await db.all(
      'SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY position, id',
      [row.id]
    );
    return { checklist: { ...shapeChecklist(row), items: items.map(shapeItem) } };
  },

  'POST /api/checklists': async (ctx) => {
    requireCatalogManager(ctx);
    const name = wanted(ctx.body?.name).slice(0, 120);
    const category = wantedCategory(ctx.body?.category);
    const isDefault = Boolean(ctx.body?.isDefault);
    await assertUniqueName(name);
    if (isDefault) await claimDefault(db, category, 0);
    const info = await db.run(
      `INSERT INTO checklists (name, description, category, is_default, created_at)
       VALUES (?, ?, ?, ${isDefault ? 'TRUE' : 'FALSE'}, ?) RETURNING id`,
      [name, text(ctx.body?.description, 500), category, nowISO()]
    );
    const row = await checklistRow(info.lastInsertId);
    return { checklist: { ...shapeChecklist(row), items: [] } };
  },

  'PATCH /api/checklists/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await checklistRow(ctx.params.id);
    const body = ctx.body || {};
    const next = {
      name: body.name === undefined ? row.name : wanted(body.name).slice(0, 120),
      description: body.description === undefined ? row.description : text(body.description, 500),
      category: body.category === undefined ? row.category || '' : wantedCategory(body.category),
      isDefault: body.isDefault === undefined ? Boolean(row.is_default) : Boolean(body.isDefault),
    };
    if (next.name !== row.name) await assertUniqueName(next.name, row.id);
    if (next.isDefault) await claimDefault(db, next.category, row.id);
    await db.run(
      `UPDATE checklists SET name = ?, description = ?, category = ?, is_default = ${next.isDefault ? 'TRUE' : 'FALSE'} WHERE id = ?`,
      [next.name, next.description, next.category, row.id]
    );
    return { checklist: shapeChecklist(await checklistRow(row.id)) };
  },

  'DELETE /api/checklists/:id': async (ctx) => {
    requireDeleter(ctx, 'a checklist');
    const row = await checklistRow(ctx.params.id);
    if (Number(row.project_count) > 0) {
      throw new HttpError(
        409,
        `"${row.name}" is used by ${row.project_count} project(s) — detach it from them first`
      );
    }
    await db.run('DELETE FROM checklists WHERE id = ?', [row.id]);
    return { ok: true, name: row.name };
  },

  'POST /api/checklists/:id/items': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await checklistRow(ctx.params.id);
    const body = ctx.body || {};

    // Two ways in: one item, or the bulk paste the admin panel sends after
    // splitting "section | title | help" lines. Forty typed rows would otherwise
    // be forty round trips and forty chances to lose half of them.
    const incoming = Array.isArray(body.items) ? body.items : [body];
    const parsed = [];
    for (const entry of incoming) {
      const source = typeof entry === 'string' ? { line: entry } : entry || {};
      let section = text(source.section, 120);
      let title = text(source.title, 300);
      let help = text(source.help, 500);
      if (source.line !== undefined && !title) {
        const parts = String(source.line).split('|').map((p) => p.trim());
        section = section || (parts.length > 2 ? parts[0] : '');
        title = parts.length > 2 ? parts[1] : parts[0];
        help = parts.length > 2 ? parts.slice(2).join(' | ') : parts[1] || '';
      }
      if (!title) continue;
      parsed.push({ section, title, help });
    }
    if (!parsed.length) throw new HttpError(400, 'An item needs at least a title');

    const max = await db.get(
      'SELECT COALESCE(MAX(position), -1) AS p FROM checklist_items WHERE checklist_id = ?',
      [row.id]
    );
    let position = Number(max && max.p) + 1;
    const created = [];
    await db.transaction(async (tx) => {
      for (const item of parsed) {
        const info = await tx.run(
          `INSERT INTO checklist_items (checklist_id, section, title, help, position)
           VALUES (?, ?, ?, ?, ?) RETURNING id`,
          [row.id, item.section, item.title, item.help, position]
        );
        created.push({ id: Number(info.lastInsertId), ...item, position });
        position += 1;
      }
    });
    return { items: created, checklist: shapeChecklist(await checklistRow(row.id)) };
  },

  'PATCH /api/checklist-items/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await itemRow(ctx.params.id);
    const body = ctx.body || {};
    const next = {
      section: body.section === undefined ? row.section : text(body.section, 120),
      title: body.title === undefined ? row.title : wanted(body.title).slice(0, 300),
      help: body.help === undefined ? row.help : text(body.help, 500),
      position:
        body.position === undefined || Number.isNaN(Number(body.position))
          ? Number(row.position || 0)
          : Number(body.position),
    };
    await db.run(
      'UPDATE checklist_items SET section = ?, title = ?, help = ?, position = ? WHERE id = ?',
      [next.section, next.title, next.help, next.position, row.id]
    );
    return { item: shapeItem(await itemRow(row.id)) };
  },

  'DELETE /api/checklist-items/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await itemRow(ctx.params.id);
    await db.run('DELETE FROM checklist_items WHERE id = ?', [row.id]);
    return { ok: true, title: row.title };
  },

  'GET /api/projects/:id/checklists': async (ctx) => {
    await assertProject(ctx.params.id);
    return { checklists: await projectChecklists(ctx.params.id) };
  },

  'POST /api/projects/:id/checklists': async (ctx) => {
    const project = await assertProject(ctx.params.id);
    const checklistId = Number(ctx.body?.checklistId);
    if (!Number.isInteger(checklistId) || checklistId <= 0) {
      throw new HttpError(400, 'Choose a checklist to attach');
    }
    const template = await checklistRow(checklistId);
    const existing = await db.get(
      'SELECT id FROM project_checklists WHERE project_id = ? AND checklist_id = ?',
      [project.id, checklistId]
    );
    if (existing) throw new HttpError(409, `"${template.name}" is already on this project`);
    await db.run(
      'INSERT INTO project_checklists (project_id, checklist_id, created_at) VALUES (?, ?, ?)',
      [project.id, checklistId, nowISO()]
    );
    return { checklists: await projectChecklists(project.id) };
  },

  'DELETE /api/project-checklists/:id': async (ctx) => {
    requireDeleter(ctx, 'a checklist from a project');
    const row = await db.get(
      `SELECT pc.*, c.name FROM project_checklists pc
         JOIN checklists c ON c.id = pc.checklist_id
        WHERE pc.id = ?`,
      [ctx.params.id]
    );
    if (!row) throw new HttpError(404, 'Checklist not found on this project');
    const answered = await db.get(
      `SELECT COUNT(*) AS n FROM project_checklist_items
        WHERE project_checklist_id = ? AND status <> ?`,
      [row.id, OPEN]
    );
    // The answers cascade with the link; the dialog said how much work that is.
    await db.run('DELETE FROM project_checklists WHERE id = ?', [row.id]);
    return { ok: true, name: row.name, answered: Number(answered && answered.n) || 0 };
  },

  'PATCH /api/project-checklists/:id/items/:itemId': async (ctx) => {
    const link = await db.get(
      `SELECT pc.id, pc.project_id, pc.checklist_id, c.name
         FROM project_checklists pc
         JOIN checklists c ON c.id = pc.checklist_id
        WHERE pc.id = ?`,
      [ctx.params.id]
    );
    if (!link) throw new HttpError(404, 'Checklist not found on this project');
    const item = await itemRow(ctx.params.itemId);
    if (Number(item.checklist_id) !== Number(link.checklist_id)) {
      throw new HttpError(400, 'That item does not belong to this checklist');
    }

    const body = ctx.body || {};
    const status = body.status === undefined ? null : String(body.status).trim();
    if (status !== null && !CHECKLIST_STATUS.includes(status)) {
      throw new HttpError(400, `Unknown status: ${status}`);
    }
    const note = body.note === undefined ? null : text(body.note, 2000);
    let fileId = body.fileId === undefined ? undefined : body.fileId;
    if (fileId === null || fileId === '' || fileId === 0) fileId = null;
    if (fileId !== undefined && fileId !== null) {
      const file = await db.get('SELECT id, project_id FROM project_files WHERE id = ?', [
        Number(fileId),
      ]);
      if (!file) throw new HttpError(404, 'That file no longer exists');
      if (Number(file.project_id) !== Number(link.project_id)) {
        throw new HttpError(400, 'That file belongs to a different project');
      }
      fileId = Number(file.id);
    }

    const current = await db.get(
      'SELECT * FROM project_checklist_items WHERE project_checklist_id = ? AND item_id = ?',
      [link.id, item.id]
    );
    const next = {
      status: status === null ? (current ? current.status : OPEN) : status,
      note: note === null ? (current ? current.note : '') : note,
      file_id: fileId === undefined ? (current ? current.file_id : null) : fileId,
    };
    const changed =
      !current ||
      current.status !== next.status ||
      (current.note || '') !== next.note ||
      (current.file_id ? Number(current.file_id) : null) !== (next.file_id ? Number(next.file_id) : null);
    const stamp = changed ? nowISO() : current.updated_at || nowISO();

    if (current) {
      await db.run(
        `UPDATE project_checklist_items
            SET status = ?, note = ?, file_id = ?, updated_by = ?, updated_at = ?
          WHERE project_checklist_id = ? AND item_id = ?`,
        [next.status, next.note, next.file_id, ctx.user.id, stamp, link.id, item.id]
      );
    } else {
      await db.run(
        `INSERT INTO project_checklist_items
           (project_checklist_id, item_id, status, note, file_id, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [link.id, item.id, next.status, next.note, next.file_id, ctx.user.id, stamp]
      );
    }

    const answers = await db.all(
      'SELECT * FROM project_checklist_items WHERE project_checklist_id = ?',
      [link.id]
    );
    const items = await db.all('SELECT id FROM checklist_items WHERE checklist_id = ?', [
      link.checklist_id,
    ]);
    return {
      item: {
        id: Number(item.id),
        status: next.status,
        note: next.note,
        fileId: next.file_id ? Number(next.file_id) : null,
        updatedAt: stamp,
        updatedByName: ctx.user.name || '',
      },
      progress: progressOf(items, answers),
    };
  },

  // Notes can point at a checklist item, so the label has to be readable from
  // somewhere. Exposed as its own tiny route rather than widened into /api/checklists.
  'GET /api/checklist-items/:id': async (ctx) => {
    const row = await itemLabel(ctx.params.id);
    if (!row) throw new HttpError(404, 'Checklist item not found');
    return {
      item: {
        id: Number(row.id),
        title: row.title,
        section: row.section || '',
        checklistId: Number(row.checklist_id),
        checklistName: row.checklist_name,
      },
    };
  },
};
