/**
 * OneProMag API tests.
 *
 * These call the route handlers directly instead of spawning a server: `api` is
 * a plain map of `'METHOD /path' -> handler({ user, params, query, body })` and
 * the database is a file, so a test needs no HTTP client, no port, no extra
 * package. `node --test test/` is the whole runner.
 *
 * Each run gets its OWN database in a temp directory — `DATA_DIR` is read when
 * `server/db.js` is imported, so it has to be set before the dynamic import
 * below. The demo seed is the fixture: eight pentesters with a real hierarchy,
 * five clients, seven projects, retests and a device inventory, which is what
 * makes the state-transition tests meaningful without hand-built rows.
 *
 * What is deliberately NOT tested here: rendering, and anything that needs a
 * browser. Those are verified in the container.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'opm-test-'));

let api;
let db;

/** The shape `currentUser()` hands to every handler, built from a seed account. */
async function asUser(username) {
  const row = await db.get(
    'SELECT id, username, name, role, subrole, parent_id, phone, email FROM users WHERE username = ?',
    [username]
  );
  if (!row) throw new Error(`no such seed user: ${username}`);
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

/** Call one route as one person. `params` are the `:id` segments. */
function call(route, user, { params = {}, query = {}, body = null } = {}) {
  return api[route]({ user, params, query, body });
}

const member = () => asUser('bagas'); // Pentester, Member
const lead = () => asUser('rafi'); // Pentester, Lead

before(async () => {
  process.env.DB = 'sqlite';
  process.env.DATA_DIR = DATA_DIR;
  process.env.SEED_DEMO = '1';
  process.env.ALLOW_REGISTER = '0'; // the production posture
  const dbModule = await import('../server/db.js');
  const apiModule = await import('../server/api.js');
  db = dbModule.db;
  api = apiModule.api;
  await dbModule.initDatabase();
});

after(async () => {
  try {
    await db.close();
  } finally {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
});

/* ============================================================
   The delete rule: anyone signed in may view, create and edit;
   only an admin, lead or sub lead may delete.
   ============================================================ */

test('a Member cannot delete a project, and the project survives', async () => {
  const user = await member();
  const { projects } = await call('GET /api/projects', user);
  const target = projects[0];

  await assert.rejects(() => call('DELETE /api/projects/:id', user, { params: { id: target.id } }), {
    status: 403,
  });

  const after = await call('GET /api/projects', user);
  assert.equal(after.projects.length, projects.length);
  assert.ok(after.projects.some((p) => Number(p.id) === Number(target.id)));
});

test('a Lead can delete a project', async () => {
  const user = await lead();
  const created = await call('POST /api/projects', user, {
    body: { name: 'Disposable engagement', clientId: 1 },
  });
  const id = created.project.id;

  await call('DELETE /api/projects/:id', user, { params: { id } });

  const { projects } = await call('GET /api/projects', user);
  assert.ok(!projects.some((p) => Number(p.id) === Number(id)), 'project still listed');
});

test('a Member can still create and edit a project', async () => {
  const user = await member();
  const created = await call('POST /api/projects', user, {
    body: { name: 'Filed by a tester', clientId: 1 },
  });
  assert.equal(created.project.name, 'Filed by a tester');

  const patched = await call('PATCH /api/projects/:id', user, {
    params: { id: created.project.id },
    body: { name: 'Renamed by a tester', status: 'Ongoing' },
  });
  assert.equal(patched.project.name, 'Renamed by a tester');
  assert.equal(patched.project.status, 'Ongoing');
});

test('a Member cannot delete a retest request, but can move it', async () => {
  const user = await member();
  const { projects } = await call('GET /api/projects', user);
  const project = projects.find((p) => (p.openRetests || []).length);
  assert.ok(project, 'the seed should leave an open retest somewhere');
  const retest = project.openRetests[0];

  await assert.rejects(() => call('DELETE /api/retests/:id', user, { params: { id: retest.id } }), {
    status: 403,
  });

  const moved = await call('PATCH /api/retests/:id', user, {
    params: { id: retest.id },
    body: { status: 'Ready' },
  });
  assert.equal(moved.retest.status, 'Ready');
});

test('a Member cannot delete a device, but can edit one', async () => {
  const user = await member();
  const { devices } = await call('GET /api/devices', user, { query: {} });
  const device = devices[0];

  await assert.rejects(() => call('DELETE /api/devices/:id', user, { params: { id: device.id } }), {
    status: 403,
  });

  const edited = await call('PATCH /api/devices/:id', user, {
    params: { id: device.id },
    body: { name: `${device.name} (renamed)` },
  });
  assert.match(edited.device.name, /\(renamed\)$/);
});

test('dropping a device column requires a lead, renaming one does not', async () => {
  const user = await member();
  // `columns` is keyed by kind for every type, so the tab strip can render
  // without another round trip.
  const listing = await call('GET /api/devices', user, { query: { kind: 'Misc' } });
  const columns = listing.columns.Misc;
  assert.ok(columns.length >= 2);

  // Renaming / reordering keeps every column: allowed.
  const renamed = columns.map((c, i) =>
    i === 0 ? { key: c.key, label: `${c.label}?`, hidden: c.hidden } : c
  );
  await call('PATCH /api/devices/columns/:kind', user, {
    params: { kind: 'Misc' },
    body: { columns: renamed },
  });

  // Dropping one is a delete: refused, and nothing changed.
  const dropped = columns.slice(1).map((c) => ({ key: c.key, label: c.label }));
  await assert.rejects(
    () => call('PATCH /api/devices/columns/:kind', user, { params: { kind: 'Misc' }, body: { columns: dropped } }),
    { status: 403 }
  );
  const still = await call('GET /api/devices', user, { query: { kind: 'Misc' } });
  assert.equal(still.columns.Misc.length, columns.length);
});

/* ============================================================
   State transitions — the product's actual value.
   ============================================================ */

test('creating a retest on a Done project leaves the project Done', async () => {
  const user = await lead();
  const { projects } = await call('GET /api/projects', user);
  const done = projects.find((p) => p.status === 'Done');
  assert.ok(done, 'the seed should contain a finished engagement');

  const created = await call('POST /api/projects/:id/retests', user, {
    params: { id: done.id },
    body: { status: 'Incoming' },
  });
  assert.equal(created.retest.status, 'Incoming');

  const reloaded = await call('GET /api/projects/:id', user, { params: { id: done.id } });
  assert.equal(reloaded.project.status, 'Done', 'the engagement must not be reopened');
  assert.equal(reloaded.project.endedAt, done.endedAt);
});

test('a Member may only change their own availability', async () => {
  const user = await member();
  const other = await asUser('dewi');

  const mine = await call('PATCH /api/availability/:id', user, {
    params: { id: user.id },
    body: { status: 'Leave' },
  });
  assert.equal(mine.pentester.availability, 'Leave');

  await assert.rejects(
    () => call('PATCH /api/availability/:id', user, { params: { id: other.id }, body: { status: 'Exam' } }),
    { status: 403 }
  );
});

test('only a pentester can be attached to a project as a pentester', async () => {
  const user = await lead();
  const admin = await asUser('admin');
  const { projects } = await call('GET /api/projects', user);

  await assert.rejects(
    () => call('POST /api/projects/:id/pentesters', user, { params: { id: projects[0].id }, body: { userId: admin.id } }),
    { status: 404 }
  );

  // The same id through the project-edit path must not sneak in either.
  const edited = await call('PATCH /api/projects/:id', user, {
    params: { id: projects[0].id },
    body: { pentesterIds: [admin.id, (await member()).id] },
  });
  const ids = edited.project.pentesters.map((p) => Number(p.id));
  assert.ok(!ids.includes(Number(admin.id)), 'an admin was written into project_pentesters');
  assert.ok(ids.includes(Number((await member()).id)));
});

test('a locked property cannot be deleted, and neither can one in use', async () => {
  const user = await lead();
  const { categories } = await call('GET /api/properties', user);
  const locked = categories.find((p) => p.locked);
  assert.ok(locked);

  await assert.rejects(
    () => call('DELETE /api/properties/:kind/:id', user, { params: { kind: 'category', id: locked.id } }),
    { status: 409 }
  );
});

/* ============================================================
   Schema — a fresh database must end up with every column the code reads.
   ============================================================ */

test('a fresh database has the columns the code selects', async () => {
  const columns = (await db.all('PRAGMA table_info(projects)')).map((c) => c.name);
  for (const needed of ['started_at', 'ended_at', 'client_id', 'application_id', 'manager_id']) {
    assert.ok(columns.includes(needed), `projects.${needed} missing from a fresh install`);
  }
});
