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
    // Blank is a deliberate answer — the current edition does not publish this
    // case any more — so only a slug that is present has to be a slug.
    assert.ok(!one.slug || !one.slug.startsWith('/'), `${one.code} has a bad page slug`);
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
  const noPage = [];
  for (const one of cases) {
    assert.match(one.code, /^WSTG-[A-Z]{4}-\d{2}$/, one.code);
    assert.ok(dir.has(one.category), `${one.code} belongs to no category`);
    // A case the current edition dropped keeps its row and its title but has no
    // page: no link is the honest rendering, a 404 is not.
    if (!one.url) {
      noPage.push(one.code);
      continue;
    }
    assert.ok(
      one.url.startsWith(`${WSTG_BASE}/${dir.get(one.category)}/`),
      `${one.code} points outside its category`
    );
  }
  assert.deepEqual(noPage.sort(), [
    'WSTG-ATHN-01',
    'WSTG-CLNT-08',
    'WSTG-CONF-03',
    'WSTG-CONF-08',
    'WSTG-CONF-14',
    'WSTG-IDNT-05',
    'WSTG-INFO-09',
    'WSTG-INPV-03',
  ]);
  // A category and a case are different questions with different pages, and the
  // slugs the site spells against their titles are stored, not derived.
  const idor = cases.find((c) => c.code === 'WSTG-ATHZ-04');
  // The 2026 edition moved Authorization from 05- to 09-Authorization and
  // Information Gathering from 01- to 05-: the published path, not the old one.
  assert.equal(idor.url, `${WSTG_BASE}/09-Authorization/04-Insecure_Direct_Object_References/`);
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
  assert.ok(saved.guide.wstgUrl.endsWith('/05-Information_Gathering/'));
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
  // Every row is taught by the guide written for its own case, so the link carries
  // the case id rather than the category's first claimant.
  const linked = full.checklist.items.filter((i) => i.guide);
  assert.equal(linked.length, 116, 'the template lost its guide links');
  for (const item of linked) {
    const own = item.guide === item.title.split(' ')[0].toLowerCase();
    // The framework page answers two cases: its own, and the one merged into it.
    const merged = item.title.startsWith('WSTG-INFO-09') && item.guide === 'wstg-info-08';
    assert.ok(own || merged, `${item.title} opens ${item.guide}`);
    if (item.wstgUrl) assert.match(item.wstgUrl, /^https:\/\/wstg\.owasp\.org\//);
  }
});

test('the WSTG method pages ship as guides, one per case', async () => {
  const { guides } = await call('GET /api/tests', admin);
  const imported = guides.filter((g) => g.id.startsWith('wstg-'));
  assert.equal(imported.length, 115, 'a published method page is missing');
  // Quoted, not rewritten: a guide that names a page carries what that page says.
  for (const guide of imported) {
    assert.match(guide.code, /^WSTG-[A-Z]{4}-\d{2}$/, `${guide.id} cites no case`);
    assert.ok(guide.what.length > 200, `${guide.id} has no summary`);
    // Markdown since v1.31: several steps of prose, not a list of two entries.
    assert.ok(guide.steps.trim().length > 80, `${guide.id} has no steps`);
    assert.ok(guide.checklistId, `${guide.id} is filed under no checklist`);
    // The page it quotes, so a reader can check the quote against the source.
    assert.match(guide.reference, /^https:\/\//, `${guide.id} cites no page`);
    assert.equal(guide.references.length, 1, `${guide.id} cites ${guide.references.length} pages`);
  }
});

test('a guide carries the reference link its author typed', async () => {
  const created = await call('POST /api/tests', admin, {
    body: {
      code: 'ZZ-REF-1',
      title: 'Reference link, typed',
      what: 'What this section means.',
      reference: 'https://example.org/method',
    },
  });
  assert.equal(created.guide.reference, 'https://example.org/method');

  // A bare host is a web address its author did not finish typing.
  const bare = await call('PATCH /api/tests/:id', admin, {
    params: { id: created.guide.id },
    body: { reference: 'owasp.org/www-project-web-security-testing-guide/' },
  });
  assert.equal(
    bare.guide.reference,
    'https://owasp.org/www-project-web-security-testing-guide/'
  );

  // Anything that is not http(s) is refused rather than stored: it would be a
  // payload on a page a client reads.
  await assert.rejects(
    () =>
      call('PATCH /api/tests/:id', admin, {
        params: { id: created.guide.id },
        body: { reference: 'javascript:alert(1)' },
      }),
    /web address/
  );

  // And leaving it empty is a real answer.
  const cleared = await call('PATCH /api/tests/:id', admin, {
    params: { id: created.guide.id },
    body: { reference: '' },
  });
  assert.equal(cleared.guide.reference, '');

  // An edit that does not mention the reference keeps the one it had.
  const kept = await call('PATCH /api/tests/:id', admin, {
    params: { id: created.guide.id },
    body: { reference: 'https://example.org/kept', title: 'Reference link, kept' },
  });
  assert.equal(kept.guide.reference, 'https://example.org/kept');
  const retitled = await call('PATCH /api/tests/:id', admin, {
    params: { id: created.guide.id },
    body: { title: 'Reference link, renamed' },
  });
  assert.equal(retitled.guide.reference, 'https://example.org/kept');

  // Several pages: one link per line, in the order the author wrote them, and
  // the same text handed back as a list for the page to render.
  const several = await call('PATCH /api/tests/:id', admin, {
    params: { id: created.guide.id },
    body: {
      reference: 'https://example.org/one\nexample.org/two\n\nhttps://example.org/three',
    },
  });
  assert.deepEqual(several.guide.references, [
    'https://example.org/one',
    'https://example.org/two',
    'https://example.org/three',
  ]);
  assert.equal(
    several.guide.reference,
    'https://example.org/one\nhttps://example.org/two\nhttps://example.org/three'
  );
  // A bad line in the middle refuses the whole save rather than silently dropping.
  await assert.rejects(
    () =>
      call('PATCH /api/tests/:id', admin, {
        params: { id: created.guide.id },
        body: { reference: 'https://example.org/one\njavascript:alert(1)' },
      }),
    /web address/
  );

  // The steps are Markdown the author wrote: newlines, bullets and a fenced
  // command all survive the round trip untouched.
  const marked = [
    'Read the page, then:',
    '',
    '1. Send a quote in **any** field.',
    '2. Compare the response body.',
    '',
    '```',
    "curl -s 'https://target/?q=%27'",
    '```',
  ].join('\n');
  const written = await call('PATCH /api/tests/:id', admin, {
    params: { id: created.guide.id },
    body: { steps: marked },
  });
  assert.equal(written.guide.steps, marked);

  await call('DELETE /api/tests/:id', admin, { params: { id: created.guide.id } });
});

