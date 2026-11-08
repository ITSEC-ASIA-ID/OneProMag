import { db } from '../db.js';
import { HttpError, nowISO } from '../auth.js';
import { COMMON_FINDINGS, WSTG_SHAPE } from '../knowledge.js';
import { forgetWstg, wstgIndex, wstgUrlOf } from '../wstg-store.js';
import { requireCatalogManager, requireDeleter } from '../shared.js';

/* ============================================================
   The reference libraries
   ------------------------------------------------------------
   `/tests` — how to test an area of a checklist. `/findings` — what a failure
   looks like when you find one.

   The guides began as a module because the text is ours and a sentence fix
   should not need a schema bump. That was true while nobody could edit them; an
   admin now owns the writing, so the guides are a table (`test_guides`) seeded
   from `server/knowledge.js` on first boot and never rewritten afterwards. The
   findings stay in the module: nobody has asked to edit those, and a finding is
   a template the client never receives verbatim — it is copied into a project
   and rewritten there.

   The guide table stores the LISTS as JSON text: nothing queries inside them,
   they are always read whole, and a child table would buy nothing but joins.

   What is derived, never stored twice:
     · the checklist a guide teaches — a row id, so a rename reaches the Tests
       page without a deploy;
     · the category — the checklist's category, because a project's category,
       its checklist and its guides are one chain, not three vocabularies;
     · `asked` — the checklists whose items point back at the guide, read from
       the items so adding a row makes a guide findable the same day.
   ============================================================ */

const MAX_LIST = 40;
const MAX_LINE = 600;

function text(value, max = 300) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

function wanted(value) {
  const raw = text(value, 200);
  if (!raw) throw new HttpError(400, 'A title is required');
  return raw;
}

/** A list field arrives as an array or as "one line each" text from the form. */
function lines(value, max = MAX_LINE) {
  const source = Array.isArray(value) ? value : String(value ?? '').split('\n');
  return source
    .map((line) => text(line, max))
    .filter(Boolean)
    .slice(0, MAX_LIST);
}

function parseList(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    // A hand-edited database row must not take the page down with it.
    return [];
  }
}

/** A WSTG directory as the site spells it, without the slashes a URL adds. */
function dirOf(value) {
  return text(value, 120).replace(/^\/+|\/+$/g, '');
}

/** `A11:2025` → `a11-2025`, the id a citation can carry safely. */
function slugOf(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function shapeGuide(row, index) {
  // A citation, resolved here so a page never has to build a URL for it. The
  // tables are the truth, so a row naming a category an admin deleted simply
  // renders without a link instead of pointing at a page that no longer matches.
  const cite = wstgUrlOf(index, row.wstg || '');
  return {
    id: row.id,
    code: row.code || '',
    area: row.area || '',
    wstg: row.wstg || '',
    wstgTitle: cite.title,
    wstgUrl: cite.url,
    title: row.title,
    what: row.what || '',
    steps: parseList(row.steps),
    passes: parseList(row.passes),
    tools: parseList(row.tools),
    watch: parseList(row.watch),
    position: Number(row.position || 0),
    checklistId: row.checklist_id ? Number(row.checklist_id) : null,
    updatedAt: row.updated_at || '',
  };
}

async function guideRow(id) {
  const row = await db.get('SELECT * FROM test_guides WHERE id = ?', [String(id)]);
  if (!row) throw new HttpError(404, 'That guide no longer exists');
  return row;
}

async function checklistById(id) {
  const list = await db.get('SELECT id, name, category FROM checklists WHERE id = ?', [Number(id)]);
  if (!list) throw new HttpError(404, 'That checklist no longer exists');
  return list;
}

async function guidesWithChecklist(index) {
  const rows = await db.all(
    `SELECT g.*, c.name AS checklist_name, c.category AS checklist_category
       FROM test_guides g
       LEFT JOIN checklists c ON c.id = g.checklist_id
      ORDER BY g.position, g.id`
  );
  const asked = await askedWhere();
  return rows.map((row) => {
    const guide = shapeGuide(row, index);
    return {
      ...guide,
      checklistName: row.checklist_name || '',
      // The checklist owns the category; `area` is what the text was written for
      // and stays on the guide as the fallback when the template is gone.
      category: row.checklist_category || guide.area,
      // Where a pentester will actually meet this guide: one entry per checklist
      // holding rows linked to it. Derived from the items, never stored on the
      // guide — an admin adding a row makes the guide findable the same day.
      asked: asked.get(guide.id) || [],
    };
  });
}

/** guide id → the checklists whose items point at it, with how many rows each has. */
async function askedWhere() {
  const rows = await db.all(
    `SELECT i.guide_key, c.id AS checklist_id, c.name AS checklist_name
       FROM checklist_items i
       JOIN checklists c ON c.id = i.checklist_id
      WHERE i.guide_key <> ''`
  );
  const map = new Map();
  for (const row of rows) {
    const perGuide = map.get(row.guide_key) || [];
    const known = perGuide.find((a) => a.checklistId === Number(row.checklist_id));
    if (known) known.items += 1;
    else
      perGuide.push({
        checklistId: Number(row.checklist_id),
        checklistName: row.checklist_name,
        items: 1,
      });
    map.set(row.guide_key, perGuide);
  }
  return map;
}

/**
 * Everything a write can set, read off the body with the row as the fallback.
 * `area` is not an input: it is the checklist's category, and a second field a
 * human could set differently is a second vocabulary to keep in step.
 */
async function nextGuide(body, row, index) {
  const checklistId =
    body.checklistId === undefined || body.checklistId === null || body.checklistId === ''
      ? row.checklist_id
      : Number(body.checklistId);
  const list = checklistId ? await checklistById(checklistId) : null;
  // One of the twelve, or nothing. Checked rather than free text: the value is a
  // link on a published page, and a typo would render as a dead one.
  let wstg = row.wstg || '';
  if (body.wstg !== undefined) {
    const wanted_ = String(body.wstg ?? '')
      .trim()
      .toUpperCase();
    if (!wanted_) wstg = '';
    else if (index.byCategory.has(wanted_)) wstg = wanted_;
    else if (WSTG_SHAPE.test(wanted_) || wanted_.startsWith('WSTG-')) {
      // A case id (`WSTG-ATHZ-04`) is a real thing, but a guide covers a
      // category: say so instead of guessing which one it meant.
      throw new HttpError(400, `A guide cites a category, not a test case — pick ${wanted_.split('-').slice(0, 2).join('-')} or another category`);
    } else {
      throw new HttpError(400, 'A WSTG citation is a category from the WSTG page, like WSTG-ATHZ');
    }
  }
  return {
    code: body.code === undefined ? row.code || '' : text(body.code, 40),
    title: body.title === undefined ? row.title : wanted(body.title),
    wstg,
    what: body.what === undefined ? row.what || '' : text(body.what, 8000),
    steps: body.steps === undefined ? parseList(row.steps) : lines(body.steps),
    passes: body.passes === undefined ? parseList(row.passes) : lines(body.passes),
    tools: body.tools === undefined ? parseList(row.tools) : lines(body.tools),
    watch: body.watch === undefined ? parseList(row.watch) : lines(body.watch),
    checklistId: list ? Number(list.id) : null,
    area: list ? list.category || '' : row.area || '',
  };
}

export const routes = {
  'GET /api/tests': async () => {
    const index = await wstgIndex();
    return {
      guides: await guidesWithChecklist(index),
      // The categories travel with the guides so the editor can offer them without
      // a second call, and a client never hard-codes OWASP's vocabulary.
      wstg: index.categories.map(({ code, title }) => ({ code, title })),
    };
  },

  'POST /api/tests': async (ctx) => {
    requireCatalogManager(ctx);
    const body = ctx.body || {};
    const index = await wstgIndex();
    const next = await nextGuide(body, {}, index);
    const seed = slugOf(next.code) || slugOf(next.title);
    if (!seed) throw new HttpError(400, 'A guide needs a code, like A11:2025, or a title');
    // The id is a citation: `checklist_items.guide_key` and a finding's
    // `template` point at it. Deriving it once and never changing it is what
    // keeps those pointers true after the code is renamed.
    let id = seed;
    for (let n = 2; await db.get('SELECT id FROM test_guides WHERE id = ?', [id]); n += 1) {
      id = `${seed}-${n}`;
    }
    const stamp = nowISO();
    const max = await db.get('SELECT COALESCE(MAX(position), -1) AS p FROM test_guides');
    await db.run(
      `INSERT INTO test_guides
         (id, code, area, wstg, title, checklist_id, what, steps, passes, tools, watch, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        next.code,
        next.area,
        next.wstg,
        next.title,
        next.checklistId,
        next.what,
        JSON.stringify(next.steps),
        JSON.stringify(next.passes),
        JSON.stringify(next.tools),
        JSON.stringify(next.watch),
        Number(max && max.p) + 1,
        stamp,
        stamp,
      ]
    );
    const guide = (await guidesWithChecklist(index)).find((g) => g.id === id);
    return { guide };
  },

  'PATCH /api/tests/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await guideRow(ctx.params.id);
    const index = await wstgIndex();
    const next = await nextGuide(ctx.body || {}, row, index);
    await db.run(
      `UPDATE test_guides
          SET code = ?, area = ?, wstg = ?, title = ?, checklist_id = ?, what = ?,
              steps = ?, passes = ?, tools = ?, watch = ?, updated_at = ?
        WHERE id = ?`,
      [
        next.code,
        next.area,
        next.wstg,
        next.title,
        next.checklistId,
        next.what,
        JSON.stringify(next.steps),
        JSON.stringify(next.passes),
        JSON.stringify(next.tools),
        JSON.stringify(next.watch),
        nowISO(),
        row.id,
      ]
    );
    const guide = (await guidesWithChecklist(index)).find((g) => g.id === row.id);
    return { guide };
  },

  'DELETE /api/tests/:id': async (ctx) => {
    requireDeleter(ctx, 'a test guide');
    const row = await guideRow(ctx.params.id);

    // Two kinds of citation, and only one of them can be repaired from the panel.
    const items = await db.get(
      'SELECT COUNT(*) AS n FROM checklist_items WHERE guide_key = ?',
      [row.id]
    );
    const count = Number(items?.n) || 0;
    if (count > 0) {
      throw new HttpError(
        409,
        `"${row.title}" is asked by ${count} checklist item(s) — move those rows to another section first`
      );
    }
    const cited = COMMON_FINDINGS.filter((f) => f.guide === row.id).length;
    if (cited > 0) {
      // The findings library is code, so this citation cannot be edited away.
      // Refusing beats deleting a guide that a shipped page still names.
      throw new HttpError(
        409,
        `"${row.title}" is cited by ${cited} built-in finding(s) in the findings library — it can be edited, but not deleted`
      );
    }
    await db.run('DELETE FROM test_guides WHERE id = ?', [row.id]);
    return { ok: true, title: row.title };
  },


  /* ============================================================
     The WSTG itself
     ------------------------------------------------------------
     Twelve categories and 116 cases, as tables. The method used to be a module,
     which meant a typo OWASP had already fixed on their site needed a release
     from us; here an admin corrects it and the citation on every guide, the
     checklist template and every project row follow on the next read.

     The codes are the identity: `test_guides.wstg` cites a category, and a
     checklist row carries a case code in its title. Renaming is therefore a
     title/slug edit, and an id is never rewritten.
     ============================================================ */

  'GET /api/wstg': async () => {
    const index = await wstgIndex();
    return { categories: index.categories, cases: index.cases };
  },

  'POST /api/wstg/categories': async (ctx) => {
    requireCatalogManager(ctx);
    const body = ctx.body || {};
    const code = text(body.code, 20).toUpperCase();
    if (!WSTG_SHAPE.test(code)) {
      throw new HttpError(400, 'A category code looks like WSTG-ATHZ');
    }
    if (await db.get('SELECT code FROM wstg_categories WHERE code = ?', [code])) {
      throw new HttpError(409, `${code} already exists`);
    }
    const max = await db.get('SELECT COALESCE(MAX(position), -1) AS p FROM wstg_categories');
    await db.run('INSERT INTO wstg_categories (code, title, dir, position) VALUES (?, ?, ?, ?)', [
      code,
      wanted(body.title),
      dirOf(body.dir),
      Number(max && max.p) + 1,
    ]);
    forgetWstg();
    return { categories: (await wstgIndex(true)).categories };
  },

  'PATCH /api/wstg/categories/:code': async (ctx) => {
    requireCatalogManager(ctx);
    const code = String(ctx.params.code || '').toUpperCase();
    const row = await db.get('SELECT * FROM wstg_categories WHERE code = ?', [code]);
    if (!row) throw new HttpError(404, 'That WSTG category no longer exists');
    const body = ctx.body || {};
    await db.run('UPDATE wstg_categories SET title = ?, dir = ? WHERE code = ?', [
      body.title === undefined ? row.title : wanted(body.title),
      body.dir === undefined ? row.dir : dirOf(body.dir),
      code,
    ]);
    forgetWstg();
    return { categories: (await wstgIndex(true)).categories };
  },

  'DELETE /api/wstg/categories/:code': async (ctx) => {
    requireDeleter(ctx, 'a WSTG category');
    const code = String(ctx.params.code || '').toUpperCase();
    const row = await db.get('SELECT * FROM wstg_categories WHERE code = ?', [code]);
    if (!row) throw new HttpError(404, 'That WSTG category no longer exists');
    const cases = await db.get('SELECT COUNT(*) AS n FROM wstg_cases WHERE category_code = ?', [code]);
    const count = Number(cases?.n) || 0;
    if (count > 0) {
      throw new HttpError(
        409,
        `${code} still holds ${count} test case(s) — delete or move them first`
      );
    }
    const cited = await db.get('SELECT COUNT(*) AS n FROM test_guides WHERE wstg = ?', [code]);
    const guides = Number(cited?.n) || 0;
    if (guides > 0) {
      throw new HttpError(
        409,
        `${guides} guide(s) cite ${code} — point them at another category first`
      );
    }
    await db.run('DELETE FROM wstg_categories WHERE code = ?', [code]);
    forgetWstg();
    return { categories: (await wstgIndex(true)).categories };
  },

  'POST /api/wstg/cases': async (ctx) => {
    requireCatalogManager(ctx);
    const body = ctx.body || {};
    const code = text(body.code, 20).toUpperCase();
    if (!/^WSTG-[A-Z]{4}-\d{2}$/.test(code)) {
      throw new HttpError(400, 'A test case code looks like WSTG-ATHZ-04');
    }
    const category = String(body.categoryCode || code.split('-').slice(0, 2).join('-')).toUpperCase();
    const index = await wstgIndex();
    if (!index.byCategory.has(category)) {
      throw new HttpError(400, `${category} is not a WSTG category — create it first`);
    }
    if (await db.get('SELECT code FROM wstg_cases WHERE code = ?', [code])) {
      throw new HttpError(409, `${code} already exists`);
    }
    const max = await db.get('SELECT COALESCE(MAX(position), -1) AS p FROM wstg_cases WHERE category_code = ?', [category]);
    await db.run(
      'INSERT INTO wstg_cases (code, category_code, title, slug, position) VALUES (?, ?, ?, ?, ?)',
      [
        code,
        category,
        wanted(body.title),
        String(body.slug || '')
          .replace(/^\/+|\/+$/g, ''),
        Number(max && max.p) + 1,
      ]
    );
    forgetWstg();
    const fresh = await wstgIndex(true);
    return { categories: fresh.categories, cases: fresh.cases };
  },

  'PATCH /api/wstg/cases/:code': async (ctx) => {
    requireCatalogManager(ctx);
    const code = String(ctx.params.code || '').toUpperCase();
    const row = await db.get('SELECT * FROM wstg_cases WHERE code = ?', [code]);
    if (!row) throw new HttpError(404, 'That WSTG test case no longer exists');
    const body = ctx.body || {};
    let category = row.category_code;
    if (body.categoryCode !== undefined) {
      category = String(body.categoryCode || '').toUpperCase();
      if (!(await wstgIndex()).byCategory.has(category)) {
        throw new HttpError(400, `${category} is not a WSTG category`);
      }
    }
    await db.run('UPDATE wstg_cases SET category_code = ?, title = ?, slug = ? WHERE code = ?', [
      category,
      body.title === undefined ? row.title : wanted(body.title),
      body.slug === undefined
        ? row.slug
        : String(body.slug || '')
            .replace(/^\/+|\/+$/g, ''),
      code,
    ]);
    forgetWstg();
    const fresh = await wstgIndex(true);
    return { categories: fresh.categories, cases: fresh.cases };
  },

  'DELETE /api/wstg/cases/:code': async (ctx) => {
    requireDeleter(ctx, 'a WSTG test case');
    const code = String(ctx.params.code || '').toUpperCase();
    const row = await db.get('SELECT * FROM wstg_cases WHERE code = ?', [code]);
    if (!row) throw new HttpError(404, 'That WSTG test case no longer exists');
    // The shipped checklist is written from this table, so deleting a case that a
    // checklist row already names would leave a row citing a page that is gone.
    const rows = await db.get('SELECT COUNT(*) AS n FROM checklist_items WHERE title LIKE ?', [
      `${code} %`,
    ]);
    const count = Number(rows?.n) || 0;
    if (count > 0) {
      throw new HttpError(
        409,
        `${code} is asked by ${count} checklist row(s) — remove those rows in Admin → Checklists first`
      );
    }
    await db.run('DELETE FROM wstg_cases WHERE code = ?', [code]);
    forgetWstg();
    const fresh = await wstgIndex(true);
    return { categories: fresh.categories, cases: fresh.cases };
  },

  // A finding has no category of its own: it belongs to the category of the test
  // that proves it, which is the checklist's category, which is the project's.
  // One chain, no second vocabulary to keep in step by hand.
  'GET /api/findings': async () => {
    const index = await wstgIndex();
    const category = new Map((await guidesWithChecklist(index)).map((g) => [g.id, g.category]));
    return { findings: COMMON_FINDINGS.map((f) => ({ ...f, category: category.get(f.guide) || '' })) };
  },
};
