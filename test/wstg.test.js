/**
 * The WSTG as data: the seed, the tables, and the admin edits on top of them.
 *
 * These run against a real database (a temp SQLite file, like `api.test.js`) because
 * the point of moving the method out of a module is that the tables are the truth —
 * a unit test over a constant would have passed just as happily when the tables and
 * the constant disagreed, which is exactly the bug this shape prevents.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Imported in `before()`: the route module pulls in `server/db.js`, whose data
// directory is read when the module loads. A static import here would open the
// developer's own database before the temp one is chosen.
let WSTG_BASE;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'opm-wstg-'));

let api;
let db;
let admin;

async function asUser(username) {
  const row = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    subrole: row.subrole || 'Member',
    parentId: row.parent_id ?? null,
    phone: row.phone || '',
    email: row.email || '',
  };
}

function call(route, user, { params = {}, body = null } = {}) {
  return api[route]({ user, params, query: {}, body });
}

before(async () => {
  process.env.DB = 'sqlite';
  process.env.DATA_DIR = DATA_DIR;
  process.env.SEED_DEMO = '1';
  process.env.ALLOW_REGISTER = '0';
  WSTG_BASE = (await import('../server/routes/knowledge.js')).WSTG_BASE;
  const dbModule = await import('../server/db.js');
  api = (await import('../server/api.js')).api;
  db = dbModule.db;
  await dbModule.initDatabase();
  admin = await asUser('admin');
});

after(async () => {
  try {
    await db.close();
  } finally {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
});

test('the shipped seed is twelve categories and the cases they publish', async () => {
  // The seed is `server/schema/wstg.sql`, run on every boot, so what the tables hold
  // after one boot IS the shipped contract: 116 rows in twelve sections is what the
  // checklist promises on the page.
  const categories = await db.all(
    'SELECT code, dir, position FROM wstg_categories ORDER BY position, code'
  );
  assert.deepEqual(
    categories.map((c) => c.code),
    [
      'WSTG-INFO',
      'WSTG-CONF',
      'WSTG-IDNT',
      'WSTG-ATHN',
      'WSTG-ATHZ',
      'WSTG-SESS',
      'WSTG-INPV',
      'WSTG-ERRH',
      'WSTG-CRYP',
      'WSTG-BUSL',
      'WSTG-CLNT',
      'WSTG-APIT',
    ]
  );
  for (const category of categories) {
    assert.ok(category.dir, `${category.code} has no directory`);
  }

  const cases = await db.all('SELECT code, title, slug, category_code FROM wstg_cases');
  assert.equal(cases.length, 116, 'the seed lost a test case');
  for (const one of cases) {
    assert.match(one.code, /^WSTG-[A-Z]{4}-\d{2}$/, one.code);
    assert.ok(one.title.trim().length > 3, `${one.code} has no title`);
    assert.ok(one.slug && !one.slug.startsWith('/'), `${one.code} has no page slug`);
    assert.ok(
      categories.some((c) => c.code === one.category_code),
      `${one.code} sits in ${one.category_code}, which is not a category`
    );
  }
  // Every category publishes at least one case, so none is a dead heading.
  for (const category of categories) {
    assert.ok(
      cases.some((one) => one.category_code === category.code),
      `${category.code} publishes no case`
    );
  }
});

test('every case is seeded with its category and a page on wstg.owasp.org', async () => {
  const { categories, cases } = await call('GET /api/wstg', admin);
  assert.equal(categories.length, 12);
  assert.equal(cases.length, 116);
  assert.equal(new Set(cases.map((c) => c.code)).size, 116, 'two test cases share a code');

  const dir = new Map(categories.map((c) => [c.code, c.dir]));
  for (const one of cases) {
    assert.match(one.code, /^WSTG-[A-Z]{4}-\d{2}$/, one.code);
    assert.ok(dir.has(one.category), `${one.code} belongs to no category`);
    assert.ok(
      one.url.startsWith(`${WSTG_BASE}/${dir.get(one.category)}/`),
      `${one.code} points outside its category`
    );
  }
  // A category and a case are different questions with different pages, and the
  // slugs the site spells against their titles are stored, not derived.
  const idor = cases.find((c) => c.code === 'WSTG-ATHZ-04');
  assert.equal(idor.url, `${WSTG_BASE}/05-Authorization/04-Insecure_Direct_Object_References/`);
  assert.equal(idor.categoryTitle, 'Authorization');
});

test('a guide cites a category, and a case id is refused with the category named', async () => {
  const { guides } = await call('GET /api/tests', admin);
  const guide = guides[0];
  await assert.rejects(() => call('PATCH /api/tests/:id', admin, { params: { id: guide.id }, body: { wstg: 'WSTG-ATHZ-04' } }), {
    status: 400,
    message: /cites a category/,
  });
  await assert.rejects(
    () => call('PATCH /api/tests/:id', admin, { params: { id: guide.id }, body: { wstg: 'NONSENSE' } }),
    { status: 400 }
  );
  const saved = await call('PATCH /api/tests/:id', admin, {
    params: { id: guide.id },
    body: { wstg: 'WSTG-INFO' },
  });
  assert.equal(saved.guide.wstg, 'WSTG-INFO');
  assert.ok(saved.guide.wstgUrl.endsWith('/01-Information_Gathering/'));
  await call('PATCH /api/tests/:id', admin, {
    params: { id: guide.id },
    body: { wstg: 'WSTG-ATHZ' },
  });
});

test('an admin adds a category and a case, and the guide citation follows it', async () => {
  // The reason the method is a table: a correction is an edit, not a release.
  const added = await call('POST /api/wstg/categories', admin, {
    body: { code: 'wstg-zzzz', title: 'Certification Checks', dir: '/20-Certification/' },
  });
  const category = added.categories.find((c) => c.code === 'WSTG-ZZZZ');
  assert.ok(category, 'a new category was not created');
  assert.equal(category.dir, '20-Certification', 'the directory keeps its slashes off');

  const withCase = await call('POST /api/wstg/cases', admin, {
    body: { code: 'wstg-zzzz-01', title: 'Check the certificate chain', slug: '01-Check_The_Chain' },
  });
  const one = withCase.cases.find((c) => c.code === 'WSTG-ZZZZ-01');
  assert.ok(one, 'a new case was not created');
  assert.equal(one.category, 'WSTG-ZZZZ');
  assert.equal(one.url, `${WSTG_BASE}/20-Certification/01-Check_The_Chain/`);

  // A guide can cite the new category on the same boot, because nothing validates
  // against a constant any more.
  const { guides } = await call('GET /api/tests', admin);
  const guide = guides[0];
  const was = guide.wstg;
  const saved = await call('PATCH /api/tests/:id', admin, {
    params: { id: guide.id },
    body: { wstg: 'WSTG-ZZZZ' },
  });
  assert.equal(saved.guide.wstgTitle, 'Certification Checks');
  assert.ok(saved.guide.wstgUrl.endsWith('/20-Certification/'));

  // A case nobody asks about can be removed again.
  await call('DELETE /api/wstg/cases/:code', admin, { params: { code: 'WSTG-ZZZZ-01' } });
  await call('PATCH /api/tests/:id', admin, { params: { id: guide.id }, body: { wstg: was } });
  const gone = await call('DELETE /api/wstg/categories/:code', admin, { params: { code: 'WSTG-ZZZZ' } });
  assert.ok(!gone.categories.some((c) => c.code === 'WSTG-ZZZZ'));
});

test('a case a checklist row asks about, and a category that still holds cases, refuse deletion', async () => {
  await assert.rejects(
    () => call('DELETE /api/wstg/cases/:code', admin, { params: { code: 'WSTG-ATHZ-04' } }),
    { status: 409, message: /checklist row/ }
  );
  await assert.rejects(
    () => call('DELETE /api/wstg/categories/:code', admin, { params: { code: 'WSTG-APIT' } }),
    { status: 409, message: /test case/ }
  );
  await assert.rejects(
    () => call('DELETE /api/wstg/categories/:code', admin, { params: { code: 'WSTG-ATHZ' } }),
    { status: 409 }
  );
});

test('a plain member cannot edit the method', async () => {
  const member = await asUser('bagas');
  await assert.rejects(
    () => call('POST /api/wstg/categories', member, { body: { code: 'WSTG-ZZZZ', title: 'x' } }),
    { status: 403 }
  );
  await assert.rejects(
    () => call('PATCH /api/wstg/cases/:code', member, {
      params: { code: 'WSTG-ATHZ-04' },
      body: { title: 'Renamed' },
    }),
    { status: 403 }
  );
});

test('the shipped WSTG template carries the rows the table holds', async () => {
  const { checklists } = await call('GET /api/checklists', admin);
  const template = checklists.find((c) => c.name === 'OWASP WSTG');
  assert.ok(template, 'the WSTG template is not shipped');
  const full = await call('GET /api/checklists/:id', admin, { params: { id: template.id } });
  assert.equal(full.checklist.items.length, 116);
  assert.equal(new Set(full.checklist.items.map((i) => i.section)).size, 12);
  // 75 of the rows are taught by a guide; the rest are honestly unlinked.
  const linked = full.checklist.items.filter((i) => i.guide);
  assert.equal(linked.length, 75, 'the template lost its guide links');
  for (const item of linked) {
    assert.match(item.wstgUrl, /^https:\/\/wstg\.owasp\.org\//, `${item.title} carries no link`);
  }
});
