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
import { Writable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'opm-test-'));

let api;
let db;
let HANDLED;

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
  const sharedModule = await import('../server/shared.js');
  HANDLED = sharedModule.HANDLED;
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
   What is "open": every retest that is not Done, in every status.
   ============================================================ */

test('a retest on Hold is listed as open work, not as history', async () => {
  const user = await lead();
  // The seed carries RT-005-01 on Hold on a Hold engagement.
  const held = await db.get("SELECT id, project_id FROM retests WHERE status = 'Hold'");
  assert.ok(held, 'the seed should contain a retest on Hold');

  const { projects } = await call('GET /api/projects', user, { query: { activeOnly: '1' } });
  const project = projects.find((p) => Number(p.id) === Number(held.project_id));
  assert.ok(project, 'a Hold engagement belongs in the active list');
  assert.ok(
    (project.openRetests || []).some((r) => r.status === 'Hold'),
    'the Hold retest must be one of the rows the active list expands'
  );
});

test('a Hold retest alone keeps a Done engagement on the active list', async () => {
  const user = await lead();
  const { projects } = await call('GET /api/projects', user);
  const done = projects.find((p) => p.status === 'Done' && (p.openRetests || []).length);
  assert.ok(done, 'the seed should leave an open retest on a finished engagement');
  const retest = done.openRetests[0];

  await call('PATCH /api/retests/:id', user, { params: { id: retest.id }, body: { status: 'Hold' } });

  const active = await call('GET /api/projects', user, { query: { activeOnly: '1' } });
  const shown = active.projects.find((p) => Number(p.id) === Number(done.id));
  assert.ok(shown, 'the engagement must stay reachable while a paused retest is open');
  assert.equal(shown.status, 'Done', 'and must still read as Done');
  assert.ok(shown.openRetests.some((r) => r.status === 'Hold'));

  // Put it back so the rest of the suite sees the seed it was written against.
  await call('PATCH /api/retests/:id', user, { params: { id: retest.id }, body: { status: 'Ongoing' } });
});

test('the retest queue counts every non-Done retest, not just the two oldest statuses', async () => {
  const user = await lead();
  const open = await db.get("SELECT COUNT(*) AS n FROM retests WHERE status <> 'Done'");
  const stats = await call('GET /api/stats', user);
  assert.equal(Number(stats.openRetests), Number(open.n));
  assert.ok(Number(open.n) >= 3, 'the seed has two ongoing and one on hold');
});

/* ============================================================
   Interns — the trainee level below a member.
   ------------------------------------------------------------
   Two rules matter and neither is visible from the UI alone: an intern may
   report to a member, a sub lead OR a lead (they attach to whoever actually
   supervises them), and an intern can never be the supervisor of another
   intern — that would make "who is training whom" unanswerable.
   ============================================================ */

test('a lead can add an intern under a member, a sub lead or themselves', async () => {
  const user = await lead();
  const people = (await call('GET /api/pentesters', user)).pentesters;
  const byName = (name) => people.find((p) => p.name === name);

  for (const [username, name, parent] of [
    ['intern_a', 'Intern Under Member', byName('Bagas Nugroho')],
    ['intern_b', 'Intern Under Sub Lead', byName('Dewi Lestari')],
    ['intern_c', 'Intern Under Lead', byName('Rafi Pratama')],
  ]) {
    const res = await call('POST /api/pentesters', user, {
      body: { username, name, password: 'intern123', subrole: 'Intern', parentId: parent.id },
    });
    assert.equal(res.pentester.subrole, 'Intern');
    // `getPublicUser` speaks the database's column names; the client-facing shape
    // (parentId) is built by shapePentester, so read the raw column here.
    assert.equal(Number(res.pentester.parent_id), Number(parent.id));
  }
});

test('an intern cannot supervise another intern', async () => {
  const user = await lead();
  const { pentesters } = await call('GET /api/pentesters', user);
  const intern = pentesters.find((p) => p.username === 'intern_a');

  await assert.rejects(
    () =>
      call('POST /api/pentesters', user, {
        body: {
          username: 'intern_d',
          name: 'Intern Under Intern',
          password: 'intern123',
          subrole: 'Intern',
          parentId: intern.id,
        },
      }),
    // The message names the levels that WOULD be legal, in words.
    (err) => err.status === 400 && /must report to a member/i.test(err.message)
  );
});

test('an intern must report to somebody', async () => {
  const user = await lead();
  await assert.rejects(
    () =>
      call('POST /api/pentesters', user, {
        body: { username: 'intern_e', name: 'Orphan Intern', password: 'intern123', subrole: 'Intern' },
      }),
    { status: 400 }
  );
});

test('a lead can add a member directly under themselves', async () => {
  const user = await lead();
  const res = await call('POST /api/pentesters', user, {
    body: {
      username: 'member_direct',
      name: 'Member Under Lead',
      password: 'pentester123',
      subrole: 'Member',
      parentId: user.id,
    },
  });
  assert.equal(res.pentester.subrole, 'Member');
  assert.equal(Number(res.pentester.parent_id), Number(user.id));

  // ...and a member may still sit under a sub lead, which is the usual shape.
  const { pentesters } = await call('GET /api/pentesters', user);
  const subLead = pentesters.find((p) => p.username === 'dewi');
  const viaSubLead = await call('POST /api/pentesters', user, {
    body: {
      username: 'member_via_sub',
      name: 'Member Under Sub Lead',
      password: 'pentester123',
      subrole: 'Member',
      parentId: subLead.id,
    },
  });
  assert.equal(Number(viaSubLead.pentester.parent_id), Number(subLead.id));
});

test('a member still cannot report to another member', async () => {
  const user = await lead();
  const { pentesters } = await call('GET /api/pentesters', user);
  const other = pentesters.find((p) => p.username === 'bagas');

  await assert.rejects(
    () =>
      call('POST /api/pentesters', user, {
        body: {
          username: 'member_under_member',
          name: 'Member Under Member',
          password: 'pentester123',
          subrole: 'Member',
          parentId: other.id,
        },
      }),
    (err) => err.status === 400 && /must report to a sub lead or a lead/i.test(err.message)
  );
});

test('a member cannot create an intern — only admin, lead or sub lead can', async () => {
  const user = await member();
  await assert.rejects(
    () =>
      call('POST /api/pentesters', user, {
        body: {
          username: 'intern_f',
          name: 'Intern By Member',
          password: 'intern123',
          subrole: 'Intern',
          parentId: user.id,
        },
      }),
    { status: 403 }
  );
});

test('an intern is on the availability board, and knows who supervises them', async () => {
  const { board } = await call('GET /api/availability');
  const intern = board.find((r) => r.username === 'intern_a');
  assert.ok(intern, 'the intern must be a row on the board, not a hidden account');
  assert.equal(intern.subrole, 'Intern');
  assert.ok(intern.parentId, 'and must carry the reporting line the board prints as "under ..."');
  assert.equal(
    board.find((r) => Number(r.id) === Number(intern.parentId)).name,
    'Bagas Nugroho',
    'the parent row must be on the board too, or "under ..." cannot be resolved'
  );
  // The board is the bench plus the interns; the client splits them into two tables.
  assert.ok(board.some((r) => r.subrole !== 'Intern'), 'the bench is still there');
});

/* ============================================================
   Variant apps — the optional third level, Client -> Application -> Variant.
   ============================================================ */

/** A client + application to hang variants off, so tests never fight over seed rows. */
async function freshApplication(user) {
  const client = await call('POST /api/clients', user, {
    body: { name: `Variant Client ${Math.random().toString(36).slice(2, 8)}` },
  });
  const application = await call('POST /api/applications', user, {
    body: { clientId: client.client.id, name: 'Mobile App' },
  });
  return { client: client.client, application: application.application };
}

test('an application owns its variants, and they come back with it', async () => {
  const user = await lead();
  const { application } = await freshApplication(user);

  assert.deepEqual(application.variants, [], 'a new application starts with no variants');

  const created = await call('POST /api/applications/:id/variants', user, {
    params: { id: application.id },
    body: { name: 'Android' },
  });
  assert.equal(created.variant.name, 'Android');
  assert.equal(created.variant.applicationId, application.id);

  const { applications } = await call('GET /api/applications', user, {
    query: { clientId: application.clientId },
  });
  const reloaded = applications.find((a) => Number(a.id) === Number(application.id));
  assert.equal(reloaded.variants.length, 1, 'the list route carries the variants');
  assert.equal(reloaded.variants[0].name, 'Android');
});

test('two variants of one application cannot share a name', async () => {
  const user = await lead();
  const { application } = await freshApplication(user);
  await call('POST /api/applications/:id/variants', user, {
    params: { id: application.id },
    body: { name: 'iOS' },
  });
  await assert.rejects(
    () =>
      call('POST /api/applications/:id/variants', user, {
        params: { id: application.id },
        body: { name: 'ios' },
      }),
    { status: 409 }
  );
});

test('a project can point at a variant of its own application, and only its own', async () => {
  const user = await lead();
  const { client, application } = await freshApplication(user);
  const android = await call('POST /api/applications/:id/variants', user, {
    params: { id: application.id },
    body: { name: 'Android' },
  });
  const other = (
    await call('POST /api/applications', user, { body: { clientId: client.id, name: 'Web App' } })
  ).application;
  const strayVariant = await call('POST /api/applications/:id/variants', user, {
    params: { id: other.id },
    body: { name: 'Android' },
  });

  // The happy path: a project on the application, narrowed to one variant.
  const { project } = await call('POST /api/projects', user, {
    body: {
      name: 'Android build test',
      clientId: client.id,
      applicationId: application.id,
      variantId: android.variant.id,
    },
  });
  assert.equal(project.variantName, 'Android', 'the drawer prints the variant name');
  assert.equal(project.variantId, android.variant.id);

  // The variant of a DIFFERENT application is refused, not silently attached.
  await assert.rejects(
    () =>
      call('POST /api/projects', user, {
        body: {
          name: 'Wrong variant',
          clientId: client.id,
          applicationId: application.id,
          variantId: strayVariant.variant.id,
        },
      }),
    (err) => err.status === 400 && /different application/i.test(err.message)
  );

  // Switching the application drops the variant instead of keeping a stale one.
  const patched = await call('PATCH /api/projects/:id', user, {
    params: { id: project.id },
    body: { applicationId: other.id },
  });
  assert.equal(patched.project.variantId, null, 'the old variant belonged to the old application');
  assert.equal(patched.project.variantName, '');
});

test('a variant is optional on the project — most engagements test the application', async () => {
  const user = await lead();
  const { client, application } = await freshApplication(user);
  const { project } = await call('POST /api/projects', user, {
    body: { name: 'Whole app', clientId: client.id, applicationId: application.id },
  });
  assert.equal(project.variantId, null);
  assert.equal(project.variantName, '');
});

test('an application with a project on one of its variants cannot be deleted', async () => {
  const user = await lead();
  const { client, application } = await freshApplication(user);
  const variant = await call('POST /api/applications/:id/variants', user, {
    params: { id: application.id },
    body: { name: 'iOS' },
  });
  await call('POST /api/projects', user, {
    body: {
      name: 'iOS build test',
      clientId: client.id,
      applicationId: application.id,
      variantId: variant.variant.id,
    },
  });
  await assert.rejects(
    () => call('DELETE /api/applications/:id', user, { params: { id: application.id } }),
    (err) => err.status === 409 && /still use this application/i.test(err.message)
  );
});

test('deleting a variant is a delete: member out, lead in, projects keep the application', async () => {
  const user = await lead();
  const { client, application } = await freshApplication(user);
  const variant = await call('POST /api/applications/:id/variants', user, {
    params: { id: application.id },
    body: { name: 'Partner build' },
  });
  const { project } = await call('POST /api/projects', user, {
    body: {
      name: 'Partner build test',
      clientId: client.id,
      applicationId: application.id,
      variantId: variant.variant.id,
    },
  });

  const memberUser = await member();
  await assert.rejects(
    () => call('DELETE /api/variants/:id', memberUser, { params: { id: variant.variant.id } }),
    { status: 403 }
  );

  await call('DELETE /api/variants/:id', user, { params: { id: variant.variant.id } });
  const after = await call('GET /api/projects/:id', user, { params: { id: project.id } });
  assert.equal(after.project.variantId, null, 'the project keeps its application');
  assert.equal(after.project.applicationId, application.id);
});

/* ============================================================
   The role is still Project Manager. Only the PROJECT FIELD is called
   Supervisor (SV) — the account type was never renamed, and a pentester can hold
   that field too.
   ============================================================ */

test('Project Manager is still an account role, alongside Pentester and Admin', async () => {
  const { ENUMS } = await import('../server/db.js');
  assert.ok(ENUMS.role.includes('Project Manager'), 'the role must not disappear from the enum');
  assert.ok(ENUMS.role.includes('Pentester'));
  const seeded = await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'Project Manager'");
  assert.ok(Number(seeded.n) > 0, 'the demo seed still ships people with that role');
});

test('a project supervisor may be a project manager or a pentester', async () => {
  const user = await lead();
  const { supervisors } = await call('GET /api/supervisors', user);
  const roles = new Set(supervisors.map((u) => u.role));
  assert.ok(roles.has('Project Manager'), 'project managers are the first half of the pool');
  assert.ok(roles.has('Pentester'), 'and a pentester may own an engagement too');
  assert.equal(
    supervisors[0].role,
    'Project Manager',
    'project managers rank above pentesters in the picker'
  );
  assert.ok(
    !roles.has('Admin'),
    'admins run the tool, they are not offered as a project supervisor'
  );
});

/* ============================================================
   Information center — notes and sheets hang off clients, applications and now
   variants, with the same rules at every level.
   ============================================================ */

test('a note can be filed on a variant, and is separate from its application', async () => {
  const user = await lead();
  const { application } = await freshApplication(user);
  const variant = await call('POST /api/applications/:id/variants', user, {
    params: { id: application.id },
    body: { name: 'iOS' },
  });

  await call('POST /api/info', user, {
    body: { scope: 'variant', scopeId: variant.variant.id, title: 'Variant only', body: 'debug build' },
  });
  await call('POST /api/info', user, {
    body: { scope: 'application', scopeId: application.id, title: 'App wide', body: 'shared config' },
  });

  const onVariant = await call('GET /api/info', user, {
    query: { scope: 'variant', scopeId: variant.variant.id, env: 'Dev' },
  });
  assert.deepEqual(
    onVariant.entries.map((e) => e.title),
    ['Variant only'],
    'a variant note must not leak onto its application'
  );

  const onApp = await call('GET /api/info', user, {
    query: { scope: 'application', scopeId: application.id, env: 'Dev' },
  });
  assert.deepEqual(onApp.entries.map((e) => e.title), ['App wide']);
});

test('a variant has its own Dev and Prod sheets, and clients still have only Dev', async () => {
  const user = await lead();
  const { application } = await freshApplication(user);
  const variant = await call('POST /api/applications/:id/variants', user, {
    params: { id: application.id },
    body: { name: 'Android' },
  });
  const prod = await call('PATCH /api/docs/:scope/:scopeId', user, {
    params: { scope: 'variant', scopeId: variant.variant.id },
    body: { text: 'prod creds', env: 'Prod' },
  });
  assert.equal(prod.doc.text, 'prod creds');

  const dev = await call('GET /api/docs/:scope/:scopeId', user, {
    params: { scope: 'variant', scopeId: variant.variant.id },
    query: { env: 'Dev' },
  });
  assert.equal(dev.doc.text, '', 'Prod content must not appear on the Dev sheet');

  await assert.rejects(
    () =>
      call('GET /api/docs/:scope/:scopeId', user, {
        params: { scope: 'client', scopeId: application.clientId },
        query: { env: 'Prod' },
      }),
    { status: 400 }
  );
});

test('an unknown scope is refused instead of writing an unreadable row', async () => {
  const user = await lead();
  await assert.rejects(
    () => call('POST /api/info', user, { body: { scope: 'project', scopeId: 1, title: 'x' } }),
    (err) => err.status === 400 && /scope/i.test(err.message)
  );
});

test('deleting a variant takes its notes and sheets with it', async () => {
  const user = await lead();
  const { application } = await freshApplication(user);
  const variant = await call('POST /api/applications/:id/variants', user, {
    params: { id: application.id },
    body: { name: 'Doomed' },
  });
  const id = variant.variant.id;
  await call('POST /api/info', user, { body: { scope: 'variant', scopeId: id, title: 'Note', body: 'x' } });
  await call('PATCH /api/docs/:scope/:scopeId', user, {
    params: { scope: 'variant', scopeId: id },
    body: { text: 'sheet' },
  });

  await call('DELETE /api/variants/:id', user, { params: { id } });

  const notes = await db.get('SELECT COUNT(*) AS n FROM info_entries WHERE scope = ? AND scope_id = ?', [
    'variant',
    id,
  ]);
  const docs = await db.get('SELECT COUNT(*) AS n FROM documents WHERE scope = ? AND scope_id = ?', [
    'variant',
    id,
  ]);
  assert.equal(Number(notes.n), 0, 'a note left behind would be unreachable, not just untidy');
  assert.equal(Number(docs.n), 0);
});

test('deleting an application also clears its variants’ notes', async () => {
  const user = await lead();
  const { application } = await freshApplication(user);
  const variant = await call('POST /api/applications/:id/variants', user, {
    params: { id: application.id },
    body: { name: 'Child' },
  });
  await call('POST /api/info', user, {
    body: { scope: 'variant', scopeId: variant.variant.id, title: 'Note', body: 'x' },
  });
  await call('DELETE /api/applications/:id', user, { params: { id: application.id } });
  const left = await db.get('SELECT COUNT(*) AS n FROM info_entries WHERE scope = ? AND scope_id = ?', [
    'variant',
    variant.variant.id,
  ]);
  assert.equal(Number(left.n), 0);
});

/* ============================================================
   Schema — a fresh database must end up with every column the code reads.
   ============================================================ */

test('presence lists who was around, and never anyone who was not', async () => {
  // Only accounts the server has actually seen in the last couple of minutes
  // are "online"; a stale timestamp from a week ago must not count, because the
  // badge is a promise about who is at their desk right now.
  const rafi = await asUser('rafi');
  const bagas = await asUser('bagas');
  await db.run("UPDATE users SET last_seen_at = ''");
  await db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [
    new Date().toISOString(),
    bagas.id,
  ]);

  const { online } = await api['GET /api/presence']({ user: rafi });
  assert.deepEqual(
    online.map((p) => p.id).sort(),
    [bagas.id],
    'only the account with a fresh timestamp is online'
  );
  assert.equal(online[0].self, false, 'someone else is never "you"');

  // The caller sees themselves marked as self, so the badge can print "you"
  // instead of listing the reader twice.
  await db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [
    new Date().toISOString(),
    rafi.id,
  ]);
  const again = await api['GET /api/presence']({ user: rafi });
  assert.equal(again.count, 2);
  assert.equal(again.online.find((p) => p.id === rafi.id).self, true);
});

test('a fresh database has the columns the code selects', async () => {
  const columns = (await db.all('PRAGMA table_info(projects)')).map((c) => c.name);
  for (const needed of [
    'started_at',
    'ended_at',
    'client_id',
    'application_id',
    'variant_id',
    'supervisor_id',
  ]) {
    assert.ok(columns.includes(needed), `projects.${needed} missing from a fresh install`);
  }
});

/**
 * A write from outside a transaction must wait for it, not run inside it.
 *
 * Before this, a bare `run()` executed outside the driver's lock: it could fire
 * between another caller's BEGIN IMMEDIATE and COMMIT, so it was either swept up
 * in that transaction's ROLLBACK or rejected as SQLITE_BUSY. Ordering is the
 * assertion — "did not throw" would pass even if the write landed in the middle.
 */
test('a write outside a transaction waits for it instead of racing it', async () => {
  const order = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const tx = db.transaction(async (inner) => {
    order.push('tx:begin');
    await gate;
    order.push('tx:end');
  });

  const concurrent = db.run('UPDATE properties SET label = label WHERE 1 = 0').then(() => {
    order.push('write');
  });

  release();
  await Promise.all([tx, concurrent]);

  assert.deepEqual(order, ['tx:begin', 'tx:end', 'write']);

  const busy = await db.get('PRAGMA busy_timeout');
  assert.ok(
    Number(Object.values(busy)[0]) > 0,
    'busy_timeout must be set, or a second process on the same file fails instantly'
  );
});

/**
 * An expired session is deleted, not merely refused.
 *
 * Refusing it at read time is correct but leaves the row behind forever, one per
 * login. The sweep is what makes the expires_at index worth having at all, since
 * nothing else in the codebase queries that column.
 */
test('the sweep deletes dead sessions and leaves live ones alone', async () => {
  const auth = await import('../server/auth.js');
  const live = await auth.createSession(1);
  const past = new Date(Date.now() - 60_000).toISOString();
  await db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [
    'stale-token',
    1,
    past,
    past,
  ]);

  const removed = await auth.expireSessions();
  assert.ok(removed >= 1);
  assert.equal(await db.get('SELECT token FROM sessions WHERE token = ?', ['stale-token']), null);
  assert.ok(await db.get('SELECT token FROM sessions WHERE token = ?', [live.token]));
});

test('the queries that run on every page have an index to run on', async () => {
  const names = (await db.all("SELECT name FROM sqlite_master WHERE type = 'index'")).map(
    (r) => r.name
  );
  for (const needed of [
    'idx_project_pentesters_user',
    'idx_retests_project_status',
    'idx_sessions_expires',
  ]) {
    assert.ok(names.includes(needed), `${needed} missing — that query scans the table`);
  }
});

/**
 * Repeated failures get slower instead of being refused.
 *
 * The spec's open question was whether a hard lockout is acceptable. It is not:
 * keyed on the identifier, it hands any stranger a way to deny the real user
 * their account, and keyed on an IP it would be one shared counter because no
 * forwarded address is trusted behind the proxy. A delay is the property that
 * actually holds — it costs a person a second or two and a script the same per
 * guess.
 */
test('repeated wrong passwords get slower, and the right one still works', async () => {
  const auth = await import('../server/auth.js');
  auth.resetLoginFailures();
  const who = 'throttle-subject';

  for (let i = 0; i < 5; i += 1) auth.noteLoginFailure(who);
  assert.equal(auth.loginRetryDelay(who), 0, 'five failures must not delay anyone');

  const delays = [6, 7, 8, 9, 20].map(() => {
    auth.noteLoginFailure(who);
    return auth.loginRetryDelay(who);
  });
  for (let i = 1; i < delays.length; i += 1) {
    assert.ok(delays[i] >= delays[i - 1], `delay fell from ${delays[i - 1]} to ${delays[i]}`);
  }
  assert.equal(delays.at(-1), 2000, 'the delay must stop growing at the cap');

  // Another identifier is untouched: one person's typos are not everyone's pause.
  assert.equal(auth.loginRetryDelay('someone-else'), 0);

  // A success forgets only its own history.
  auth.clearLoginFailures(who);
  assert.equal(auth.loginRetryDelay(who), 0);
  assert.equal(auth.loginRetryDelay('someone-else'), 0);

  // And the credential itself still works while the counter is high.
  for (let i = 0; i < 8; i += 1) auth.noteLoginFailure('admin');
  assert.ok(auth.loginRetryDelay('admin') > 0);
  assert.ok(await auth.login('admin', 'admin123'), 'a correct password must still log in');
  auth.resetLoginFailures();
});

/**
 * The headers that stop the app being framed, sniffed or leaked through a Referer.
 *
 * Asserted against the module rather than over HTTP because importing
 * server/index.js starts listening. The single thing worth pinning is that
 * `script-src` and `style-src` stay strict — a future convenience
 * `'unsafe-inline'` there would silently turn every injected string into
 * executable code, or let one injected `style=` attribute restyle the page.
 */
test('every response forbids framing and inline script', async () => {
  const { CSP, SECURITY_HEADERS } = await import('../server/security.js');
  assert.equal(SECURITY_HEADERS['X-Frame-Options'], 'DENY');
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.equal(SECURITY_HEADERS['Referrer-Policy'], 'same-origin');
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.match(CSP, /script-src 'self'(;|$)/);
  assert.ok(!/script-src[^;]*unsafe-inline/.test(CSP), 'script-src must not allow inline');
  assert.ok(!/script-src[^;]*unsafe-eval/.test(CSP), 'script-src must not allow eval');
  // Inline styles are gone from the markup, so the stylesheet is the only source
  // of style the browser will accept.
  assert.match(CSP, /style-src 'self'/);
  assert.ok(
    !/style-src[^;]*unsafe-inline/.test(CSP),
    'style-src must not allow inline: no markup carries a style= attribute'
  );
  // The typeface comes from Google Fonts, so those two hosts must stay reachable.
  assert.match(CSP, /fonts\.googleapis\.com/);
  assert.match(CSP, /fonts\.gstatic\.com/);
});

/**
 * `updated_at` is a claim about the row, and three write paths were lying about it.
 *
 * The client posts the whole form on every save, so "open the record, change
 * nothing, press Save" reaches the server looking exactly like an edit. It used to
 * be stamped unconditionally — which moved the project to the top of its status
 * block, because the list orders by `updated_at`, and made the drawer footer
 * announce an edit that never happened.
 *
 * Each case pins the row's stamp to a fixed old value first, so the assertion
 * cannot accidentally pass because two writes landed in the same millisecond.
 */
test('saving a project without changing anything is not an edit', async () => {
  const user = await lead();
  const { client, application } = await freshApplication(user);
  const older = (
    await call('POST /api/projects', user, {
      body: { name: 'Older Ongoing', clientId: client.id, applicationId: application.id, status: 'Ongoing' },
    })
  ).project;
  const newer = (
    await call('POST /api/projects', user, {
      body: { name: 'Newer Ongoing', clientId: client.id, applicationId: application.id, status: 'Ongoing' },
    })
  ).project;
  await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [
    '2020-01-01T00:00:00.000Z',
    older.id,
  ]);
  await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [
    '2021-01-01T00:00:00.000Z',
    newer.id,
  ]);

  // Exactly what the drawer's form sends: every field, nothing altered.
  const saved = await call('PATCH /api/projects/:id', user, {
    params: { id: older.id },
    body: {
      name: older.name,
      clientId: client.id,
      applicationId: application.id,
      variantId: null,
      supervisorId: null,
      category: older.category,
      platform: older.platform,
      env: older.env,
      status: older.status,
      method: older.method,
      notes: older.notes,
      pentesterIds: [],
      startedAt: older.startedAt,
      endedAt: older.endedAt,
    },
  });
  assert.equal(
    saved.project.updatedAt,
    '2020-01-01T00:00:00.000Z',
    'a save that changed nothing must not claim an edit'
  );

  // And the list it feeds is untouched: the genuinely newer row still comes first.
  const { projects } = await call('GET /api/projects', user, { query: { status: 'Ongoing' } });
  const order = projects.filter((p) => p.id === older.id || p.id === newer.id).map((p) => p.id);
  assert.deepEqual(order, [newer.id, older.id], 'a no-op save must not reorder the list');
});

test('changing one field of a project moves its timestamp', async () => {
  const user = await lead();
  const { client, application } = await freshApplication(user);
  const { project } = await call('POST /api/projects', user, {
    body: { name: 'Edited', clientId: client.id, applicationId: application.id },
  });
  await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [
    '2020-01-01T00:00:00.000Z',
    project.id,
  ]);

  const saved = await call('PATCH /api/projects/:id', user, {
    params: { id: project.id },
    body: { notes: 'a real edit' },
  });
  assert.notEqual(saved.project.updatedAt, '2020-01-01T00:00:00.000Z');

  // A status transition counts even when no body field differs: resolveDates
  // stamps started_at, so the row really did change.
  await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [
    '2020-01-01T00:00:00.000Z',
    project.id,
  ]);
  const moved = await call('PATCH /api/projects/:id', user, {
    params: { id: project.id },
    body: { status: 'Ongoing' },
  });
  assert.notEqual(moved.project.updatedAt, '2020-01-01T00:00:00.000Z');
  assert.equal(moved.project.startedAt.length, 10, 'entering Ongoing still stamps the start date');

  // The test bench lives in its own table, so it has to be compared explicitly:
  // adding somebody changes the team cell the list renders.
  await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [
    '2020-01-01T00:00:00.000Z',
    project.id,
  ]);
  const pentester = await asUser('bagas');
  const staffed = await call('PATCH /api/projects/:id', user, {
    params: { id: project.id },
    body: { pentesterIds: [pentester.id] },
  });
  assert.notEqual(staffed.project.updatedAt, '2020-01-01T00:00:00.000Z');
  assert.equal(staffed.project.pentesters.length, 1);
});

test('a retest save follows the same rule, and so does the project it belongs to', async () => {
  const user = await lead();
  const { client, application } = await freshApplication(user);
  const { project } = await call('POST /api/projects', user, {
    body: { name: 'Retest host', clientId: client.id, applicationId: application.id },
  });
  const { retest } = await call('POST /api/projects/:id/retests', user, {
    params: { id: project.id },
    body: { notes: 'first pass' },
  });
  await db.run('UPDATE retests SET updated_at = ? WHERE id = ?', [
    '2020-01-01T00:00:00.000Z',
    retest.id,
  ]);
  await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [
    '2020-01-01T00:00:00.000Z',
    project.id,
  ]);

  const same = await call('PATCH /api/retests/:id', user, {
    params: { id: retest.id },
    body: {
      requestedAt: retest.requestedAt,
      status: retest.status,
      notes: retest.notes,
      startedAt: retest.startedAt,
      endedAt: retest.endedAt,
    },
  });
  assert.equal(same.retest.updatedAt, '2020-01-01T00:00:00.000Z', 'a no-op retest save is not an edit');
  const projectRow = await db.get('SELECT updated_at FROM projects WHERE id = ?', [project.id]);
  assert.equal(projectRow.updated_at, '2020-01-01T00:00:00.000Z', 'and it leaves the project alone');

  const changed = await call('PATCH /api/retests/:id', user, {
    params: { id: retest.id },
    body: { notes: 'second pass' },
  });
  assert.notEqual(changed.retest.updatedAt, '2020-01-01T00:00:00.000Z');
  const after = await db.get('SELECT updated_at FROM projects WHERE id = ?', [project.id]);
  assert.notEqual(after.updated_at, '2020-01-01T00:00:00.000Z', 'a real retest edit moves the project');
});

test('renaming a client touches the projects that print its name', async () => {
  const user = await lead();
  const { client, application } = await freshApplication(user);
  const mine = (
    await call('POST /api/projects', user, {
      body: { name: 'On the renamed client', clientId: client.id, applicationId: application.id },
    })
  ).project;
  const { client: otherClient, application: otherApp } = await freshApplication(user);
  const untouched = (
    await call('POST /api/projects', user, {
      body: { name: 'Somewhere else', clientId: otherClient.id, applicationId: otherApp.id },
    })
  ).project;
  const OLD = '2020-01-01T00:00:00.000Z';
  await db.run('UPDATE projects SET updated_at = ? WHERE id IN (?, ?)', [OLD, mine.id, untouched.id]);

  await call('PATCH /api/clients/:id', user, {
    params: { id: client.id },
    body: { name: `${client.name} Holdings` },
  });

  // The denormalised `client` column is re-rendered in every project list, so the
  // row that changed has to say so — and a project on another client must not.
  const moved = await db.get('SELECT client, updated_at FROM projects WHERE id = ?', [mine.id]);
  assert.equal(moved.client, `${client.name} Holdings`);
  assert.notEqual(moved.updated_at, OLD, 'the renamed project must not look untouched');
  const still = await db.get('SELECT updated_at FROM projects WHERE id = ?', [untouched.id]);
  assert.equal(still.updated_at, OLD, 'a project on another client did not change');
});

/**
 * A drag is not an edit, and a bulk save is exactly the rows it was handed.
 *
 * Asserted so a future refactor cannot "helpfully" stamp twenty rows because one
 * was dragged. The bulk half is the opposite promise: the server does not diff — it
 * cannot, `extra` is a JSON blob where a key-order change would flag every row — so
 * the client is what sends only the rows it changed.
 */
test('reordering devices is not an edit, and a bulk save writes exactly what it is given', async () => {
  const user = await lead();
  const { devices } = await call('GET /api/devices', user, { query: { kind: 'Android' } });
  assert.ok(devices.length >= 2, 'the seed has Android devices to reorder');
  const [a, b] = devices;
  const OLD = '2020-01-01T00:00:00.000Z';
  await db.run('UPDATE devices SET updated_at = ? WHERE kind = ?', [OLD, 'Android']);

  // Dragging a row reorders the sheet without changing the device.
  await call('PATCH /api/devices/order', user, {
    body: { kind: 'Android', ids: [b.id, a.id] },
  });
  const afterOrder = await db.all('SELECT updated_at FROM devices WHERE kind = ?', ['Android']);
  assert.ok(
    afterOrder.every((r) => r.updated_at === OLD),
    'a reorder must not stamp every row'
  );

  // And a row that is posted IS written and stamped — the client is what avoids
  // sending the untouched ones.
  const current = await call('GET /api/devices', user, { query: { kind: 'Android' } });
  const unchanged = current.devices.map((d) => ({ id: d.id, kind: d.kind, name: d.name, extra: d.extra }));
  const bulk = await call('PATCH /api/devices/bulk', user, { body: { updates: unchanged } });
  assert.equal(bulk.updated, unchanged.length);
  const afterBulk = await db.all(
    'SELECT updated_at FROM devices WHERE id IN (' + unchanged.map(() => '?').join(',') + ')',
    unchanged.map((d) => d.id)
  );
  assert.ok(
    afterBulk.every((r) => r.updated_at !== OLD),
    'a bulk save writes the rows it was given'
  );
});

/**
 * Pinning is a bookmark. This is the rule the other paths now share, so it is
 * pinned here too — it is the behaviour most likely to be "simplified" away.
 */
test('pinning a note is a bookmark, not an edit', async () => {
  const user = await lead();
  const { client } = await freshApplication(user);
  const { entry } = await call('POST /api/info', user, {
    body: { scope: 'client', scopeId: client.id, title: 'Pinned note', body: 'words' },
  });
  const OLD = '2020-01-01T00:00:00.000Z';
  await db.run('UPDATE info_entries SET updated_at = ? WHERE id = ?', [OLD, entry.id]);

  const pinned = await call('PATCH /api/info/:id', user, {
    params: { id: entry.id },
    body: { pinned: true },
  });
  assert.equal(pinned.entry.pinned, true);
  assert.equal(pinned.entry.updatedAt, OLD, 'pinning must not claim "edited just now"');

  const edited = await call('PATCH /api/info/:id', user, {
    params: { id: entry.id },
    body: { body: 'different words' },
  });
  assert.notEqual(edited.entry.updatedAt, OLD, 'a real content change does move it');
});

/* ============================================================
   Attachments and security checklists.

   The bytes are the interesting part: everything else here is a
   row, but a file is a row AND something on disk, and the two
   must never disagree — no row without bytes (a broken download)
   and no bytes without a row (garbage only a `find` finds).
   ============================================================ */

test('a file uploads, lists, downloads byte-identical, and deletes with its bytes', async () => {
  const user = await lead();
  const { projects } = await call('GET /api/projects', user);
  const projectId = projects[0].id;
  const payload = Buffer.from('scope of work — signed 2026-11-02\n', 'utf8');

  const created = await call('POST /api/projects/:id/files', user, {
    params: { id: projectId },
    body: { name: 'Scope — Q4.pdf', mime: 'application/pdf', data: payload.toString('base64') },
  });
  const file = created.file;
  assert.equal(file.name, 'Scope — Q4.pdf');
  assert.equal(file.size, payload.length);
  assert.equal(file.uploadedByName, user.name);

  const listed = await call('GET /api/projects/:id/files', user, { params: { id: projectId } });
  assert.ok(listed.files.some((f) => f.id === file.id), 'uploaded file is not listed');

  // The download streams into `res`, so it gets a stand-in Writable that keeps
  // the bytes and records the headers the browser would receive.
  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, next) {
      chunks.push(chunk);
      next();
    },
  });
  res.writeHead = (status, headers) => {
    res.status = status;
    res.headers = headers;
  };
  const result = await api['GET /api/project-files/:id/download']({
    user,
    params: { id: file.id },
    query: {},
    body: null,
    res,
  });
  assert.equal(result, HANDLED, 'a streaming handler must not return a JSON body');
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'application/octet-stream');
  assert.match(res.headers['Content-Disposition'], /^attachment;/);
  assert.match(res.headers['Content-Disposition'], /filename\*=UTF-8''Scope/);
  assert.deepEqual(Buffer.concat(chunks), payload, 'download is not byte-identical');

  const dir = path.join(DATA_DIR, 'uploads', String(projectId));
  assert.equal(fs.readdirSync(dir).length, 1, 'expected exactly one stored file');

  await call('DELETE /api/project-files/:id', user, { params: { id: file.id } });
  // Bytes and the folder that held them: an empty per-project directory left
  // behind is invisible in the UI and survives every later boot.
  assert.equal(fs.existsSync(dir), false, 'deleting the last file must delete the bytes and the folder');
});

test('a Member may upload and read an attachment but not delete one', async () => {
  const user = await member();
  const { projects } = await call('GET /api/projects', user);
  const projectId = projects[0].id;
  const created = await call('POST /api/projects/:id/files', user, {
    params: { id: projectId },
    body: { name: 'asset-list.csv', mime: 'text/csv', data: Buffer.from('a,b\n1,2\n').toString('base64') },
  });

  await assert.rejects(
    () => call('DELETE /api/project-files/:id', user, { params: { id: created.file.id } }),
    { status: 403 }
  );
  await call('GET /api/projects/:id/files', user, { params: { id: projectId } });
});

test('an empty or malformed upload is refused before anything is written', async () => {
  const user = await lead();
  const { projects } = await call('GET /api/projects', user);
  const id = projects[0].id;
  await assert.rejects(
    () => call('POST /api/projects/:id/files', user, { params: { id }, body: { name: 'x' } }),
    { status: 400 }
  );
  await assert.rejects(
    () =>
      call('POST /api/projects/:id/files', user, {
        params: { id },
        body: { name: 'x', data: 'not base64!!' },
      }),
    { status: 400 }
  );
});

test('a file over the 20 MB ceiling is refused', async () => {
  const user = await lead();
  const { projects } = await call('GET /api/projects', user);
  const bytes = Buffer.alloc(20 * 1024 * 1024 + 1, 0x41);
  await assert.rejects(
    () =>
      call('POST /api/projects/:id/files', user, {
        params: { id: projects[0].id },
        body: { name: 'huge.bin', data: bytes.toString('base64') },
      }),
    (err) => err.status === 413 && /20 MB/.test(err.message)
  );
});

test('deleting a project takes its attachment bytes with it', async () => {
  const user = await lead();
  const created = await call('POST /api/projects', user, {
    body: { name: 'Attachment purge check', clientId: 1 },
  });
  const projectId = created.project.id;
  await call('POST /api/projects/:id/files', user, {
    params: { id: projectId },
    body: { name: 'report.pdf', data: Buffer.from('hello').toString('base64') },
  });
  const dir = path.join(DATA_DIR, 'uploads', String(projectId));
  assert.equal(fs.readdirSync(dir).length, 1);

  await call('DELETE /api/projects/:id', user, { params: { id: projectId } });
  assert.ok(!fs.existsSync(dir), 'the upload directory must not outlive its project');
});

test('a file on the Information center uploads, downloads byte-identical, and deletes', async () => {
  const user = await lead();
  const { clients } = await call('GET /api/clients', user);
  const scopeId = clients[0].id;
  const payload = Buffer.from('asset list\nweb01,web02\n', 'utf8');

  const created = await call('POST /api/info-files', user, {
    body: { scope: 'client', scopeId, name: 'Asset list.csv', mime: 'text/csv', data: payload.toString('base64') },
  });
  assert.equal(created.file.name, 'Asset list.csv');
  assert.equal(created.file.size, payload.length);
  assert.equal(created.file.scope, 'client');
  assert.equal(created.file.scopeId, scopeId);

  const listed = await call('GET /api/info-files', user, { query: { scope: 'client', scopeId } });
  assert.ok(listed.files.some((f) => f.id === created.file.id), 'uploaded file is not listed');

  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, next) {
      chunks.push(chunk);
      next();
    },
  });
  res.writeHead = (status, headers) => {
    res.status = status;
    res.headers = headers;
  };
  const result = await api['GET /api/info-files/:id/download']({
    user,
    params: { id: created.file.id },
    query: {},
    body: null,
    res,
  });
  assert.equal(result, HANDLED, 'a streaming handler must not return a JSON body');
  assert.equal(res.status, 200);
  assert.match(res.headers['Content-Disposition'], /^attachment;/);
  assert.deepEqual(Buffer.concat(chunks), payload, 'download is not byte-identical');

  const dir = path.join(DATA_DIR, 'uploads', 'info', `client-${scopeId}`);
  assert.equal(fs.readdirSync(dir).length, 1, 'expected exactly one stored file');

  await call('DELETE /api/info-files/:id', user, { params: { id: created.file.id } });
  assert.equal(fs.existsSync(dir), false, 'deleting the last file must delete the bytes and the folder');
  const after = await call('GET /api/info-files', user, { query: { scope: 'client', scopeId } });
  assert.ok(!after.files.some((f) => f.id === created.file.id), 'the row survived the delete');
});

test('an information-center file may be bigger than a project attachment', async () => {
  const user = await lead();
  const { clients } = await call('GET /api/clients', user);
  const scopeId = clients[0].id;
  // 21 MB: over the attachment ceiling, under this one. It is written to disk,
  // so it is deleted again before the test ends.
  const bytes = Buffer.alloc(21 * 1024 * 1024, 0x42);
  const created = await call('POST /api/info-files', user, {
    body: { scope: 'client', scopeId, name: 'capture.pcap', data: bytes.toString('base64') },
  });
  assert.equal(created.file.size, bytes.length);
  await call('DELETE /api/info-files/:id', user, { params: { id: created.file.id } });
});

test('an information-center upload over 50 MB is refused', async () => {
  const user = await lead();
  const { clients } = await call('GET /api/clients', user);
  const bytes = Buffer.alloc(50 * 1024 * 1024 + 1, 0x41);
  await assert.rejects(
    () =>
      call('POST /api/info-files', user, {
        body: { scope: 'client', scopeId: clients[0].id, name: 'huge.bin', data: bytes.toString('base64') },
      }),
    (err) => err.status === 413 && /50 MB/.test(err.message)
  );
});

test('an information-center upload names a real target and a real scope', async () => {
  const user = await lead();
  await assert.rejects(
    () => call('POST /api/info-files', user, { body: { scope: 'galaxy', scopeId: 1, name: 'x', data: 'AA==' } }),
    { status: 400 }
  );
  await assert.rejects(
    () => call('POST /api/info-files', user, { body: { scope: 'client', scopeId: 999999, name: 'x', data: 'AA==' } }),
    { status: 404 }
  );
  await assert.rejects(
    () =>
      call('POST /api/info-files', user, {
        body: { scope: 'client', scopeId: 1, name: 'x', data: '' },
      }),
    { status: 400 }
  );
});

test('deleting a client takes its files with it', async () => {
  const admin = await asUser('admin');
  const { client } = await call('POST /api/clients', admin, { body: { name: 'Info file purge check' } });
  const scopeId = client.id;
  await call('POST /api/info-files', admin, {
    body: { scope: 'client', scopeId, name: 'vendor.pdf', data: Buffer.from('hello').toString('base64') },
  });
  const dir = path.join(DATA_DIR, 'uploads', 'info', `client-${scopeId}`);
  assert.equal(fs.readdirSync(dir).length, 1);

  await call('DELETE /api/clients/:id', admin, { params: { id: client.id } });
  assert.equal(fs.existsSync(dir), false, 'the upload directory must not outlive its client');
  const { clients } = await call('GET /api/clients', admin);
  assert.ok(!clients.some((c) => c.id === client.id));
});

test('a fresh install arrives with the current OWASP lists, each the default of its category', async () => {
  const user = await member();
  const { checklists } = await call('GET /api/checklists', user);
  const names = checklists.map((c) => c.name);
  assert.ok(names.includes('OWASP Top 10:2025'), `seeded: ${names.join(', ')}`);
  assert.ok(names.includes('OWASP API Security Top 10 2023'));
  assert.ok(names.includes('Web hardening basics'));
  assert.ok(!names.includes('OWASP Top 10 2021'), 'the 2021 list must not survive beside 2025');

  const web = checklists.find((c) => c.name === 'OWASP Top 10:2025');
  assert.equal(web.category, 'Web');
  assert.equal(web.isDefault, true);
  assert.equal(web.itemCount, 20);
  const full = await call('GET /api/checklists/:id', user, { params: { id: web.id } });
  assert.equal(full.checklist.items.length, 20);
  assert.ok(full.checklist.items.every((i) => i.section && i.title && i.help));
  assert.equal(new Set(full.checklist.items.map((i) => i.section)).size, 10);

  const api = checklists.find((c) => c.name === 'OWASP API Security Top 10 2023');
  assert.equal(api.category, 'API');
  assert.equal(api.isDefault, true);
  assert.equal(api.itemCount, 10);
});

test('choosing a category attaches its default checklist, and only once', async () => {
  const user = await member();
  const admin = await lead();
  const { clients } = await call('GET /api/clients', user);
  const { project } = await call('POST /api/projects', user, {
    body: { name: 'Category default probe', clientId: clients[0].id, category: 'API' },
  });

  const first = await call('GET /api/projects/:id/checklists', user, { params: { id: project.id } });
  assert.equal(first.checklists.length, 1, 'the API default came along');
  assert.equal(first.checklists[0].name, 'OWASP API Security Top 10 2023');
  assert.equal(first.checklists[0].progress.open, 10, 'attaching writes no answers');

  // Saving the project again must not attach a second copy nor duplicate rows.
  await call('PATCH /api/projects/:id', admin, {
    params: { id: project.id },
    body: { category: 'API', notes: 'touched' },
  });
  const again = await call('GET /api/projects/:id/checklists', user, { params: { id: project.id } });
  assert.equal(again.checklists.length, 1);

  // A different template is still attachable by hand — and since a project holds
  // exactly one checklist, attaching it REPLACES the default rather than adding a
  // second one. The old list had no answers, so nothing is lost.
  const { checklists } = await call('GET /api/checklists', user);
  const hardening = checklists.find((c) => c.name === 'Web hardening basics');
  const swapped = await call('POST /api/projects/:id/checklists', user, {
    params: { id: project.id },
    body: { checklistId: hardening.id },
  });
  assert.equal(swapped.replaced, true, 'attaching another list replaces the first');
  assert.equal(swapped.answered, 0, 'and reports how much work it destroyed');
  assert.equal(swapped.checklists.length, 1);
  assert.equal(swapped.checklists[0].name, 'Web hardening basics');

  await call('DELETE /api/projects/:id', admin, { params: { id: project.id } });
});

test('only a lead may create or edit a template, and a pasted list imports as items', async () => {
  const user = await member();
  await assert.rejects(() => call('POST /api/checklists', user, { body: { name: 'Nope' } }), {
    status: 403,
  });

  const leadUser = await lead();
  const { checklist } = await call('POST /api/checklists', leadUser, {
    body: { name: 'Client hardening list', description: 'Bank Nusantara own requirements' },
  });

  const bulk = await call('POST /api/checklists/:id/items', leadUser, {
    params: { id: checklist.id },
    body: {
      items: [
        'Transport | TLS 1.3 only | Nothing below TLS 1.2 accepted',
        'Session | Absolute timeout 8h | Token dies with the working day',
        'No separators in this line',
      ],
    },
  });
  assert.equal(bulk.items.length, 3);
  assert.equal(bulk.items[0].section, 'Transport');
  assert.equal(bulk.items[0].title, 'TLS 1.3 only');
  assert.equal(bulk.items[0].help, 'Nothing below TLS 1.2 accepted');
  assert.equal(bulk.items[2].section, '');
  assert.equal(bulk.items[2].title, 'No separators in this line');

  const single = await call('POST /api/checklists/:id/items', leadUser, {
    params: { id: checklist.id },
    body: { section: 'Logging', title: 'Auth failures logged', help: 'With the source address' },
  });
  assert.equal(single.items[0].position, 3, 'items append in order');

  await assert.rejects(
    () => call('POST /api/checklists', leadUser, { body: { name: 'Client hardening list' } }),
    { status: 409 }
  );
});

test('an item is the group and its rows are the sub items', async () => {
  const leadUser = await lead();
  const { checklist } = await call('POST /api/checklists', leadUser, { body: { name: 'Two level list' } });
  const { items } = await call('POST /api/checklists/:id/items', leadUser, {
    params: { id: checklist.id },
    body: {
      items: [
        { section: 'WSTG-INFO — Information Gathering', title: 'WSTG-INFO-01 Conduct Search Engine Reconnaissance' },
        { section: 'WSTG-INFO — Information Gathering', title: 'WSTG-INFO-02 Fingerprint Web Server' },
      ],
    },
  });
  const full = await call('GET /api/checklists/:id', leadUser, { params: { id: checklist.id } });
  const rows = full.checklist.items;
  assert.equal(rows.length, 2, 'two sub items under one item, no third level');
  assert.deepEqual(
    rows.map((row) => row.section),
    ['WSTG-INFO — Information Gathering', 'WSTG-INFO — Information Gathering']
  );
  assert.ok(rows.every((row) => !('steps' in row)), 'a row carries no sub-items of its own');

  // Deleting one sub item leaves the other, and deleting the item id takes nothing else.
  await call('DELETE /api/checklist-items/:id', leadUser, { params: { id: items[0].id } });
  const after = await call('GET /api/checklists/:id', leadUser, { params: { id: checklist.id } });
  assert.deepEqual(
    after.checklist.items.map((row) => row.title),
    ['WSTG-INFO-02 Fingerprint Web Server']
  );
});

test('a sub item owns its guide: derived by default, overridable, refusable', async () => {
  const leadUser = await lead();
  const { checklist } = await call('POST /api/checklists', leadUser, { body: { name: 'Guide per sub item' } });
  const { items } = await call('POST /api/checklists/:id/items', leadUser, {
    params: { id: checklist.id },
    body: {
      items: [
        { section: 'WSTG-INFO — Information Gathering', title: 'WSTG-INFO-01 Conduct Search Engine Reconnaissance' },
        { section: 'WSTG-INFO — Information Gathering', title: 'A row with a guide of its own', guide: 'A01' },
        { section: 'House rules — Nobody publishes this', title: 'Password policy the client wrote down' },
      ],
    },
  });
  // The case id in the title is the strongest link there is: a WSTG row is answered
  // by the guide written for that case, not by whichever guide claims its category.
  assert.equal(items[0].guide, 'wstg-info-01', 'a WSTG row finds its own case guide');
  assert.equal(items[2].guide, '', 'a row no standard covers stays unlinked');
  assert.equal(items[1].guide, 'A01', 'a row may name its own guide');
  assert.equal(items[1].guideOwned, true, 'and the row says the link is its own');
  assert.equal(items[0].guideOwned, false, 'a derived link is not owned by the row');

  // PATCH without `guide` keeps the derived link; with it, the row wins.
  const own = await call('PATCH /api/checklist-items/:id', leadUser, {
    params: { id: items[0].id },
    body: { guide: 'A02' },
  });
  assert.equal(own.item.guide, 'A02');
  // Editing the row must not unlink the guide it owns.
  const renamed = await call('PATCH /api/checklist-items/:id', leadUser, {
    params: { id: items[1].id },
    body: { title: 'Renamed, still A01' },
  });
  assert.equal(renamed.item.guide, 'A01', 'editing a sub item does not unlink its guide');
  const cleared = await call('PATCH /api/checklist-items/:id', leadUser, {
    params: { id: items[0].id },
    body: { guide: '' },
  });
  assert.equal(cleared.item.guide, '', 'empty means "no guide of its own"');

  await assert.rejects(
    call('PATCH /api/checklist-items/:id', leadUser, { params: { id: items[0].id }, body: { guide: 'NOPE' } }),
    /No guide with the id NOPE/
  );

  await call('DELETE /api/checklists/:id', leadUser, { params: { id: checklist.id } });
});

test('attach, answer, progress and detach — with the in-use delete refused', async () => {
  const leadUser = await lead();
  const user = await member();
  const { checklists } = await call('GET /api/checklists', user);
  const template = checklists.find((c) => c.name === 'Web hardening basics');
  const { projects } = await call('GET /api/projects', user);
  const projectId = projects[0].id;

  const attached = await call('POST /api/projects/:id/checklists', user, {
    params: { id: projectId },
    body: { checklistId: template.id },
  });
  const link = attached.checklists.find((c) => c.checklistId === template.id);
  assert.equal(link.progress.total, 10);
  assert.equal(link.progress.answered, 0, 'attaching writes no answer rows');
  const answerRows = await db.get(
    'SELECT COUNT(*) AS n FROM project_checklist_items WHERE project_checklist_id = ?',
    [link.id]
  );
  assert.equal(Number(answerRows.n), 0);

  // Asking for the one it already has is a no-op, not a second row.
  const same = await call('POST /api/projects/:id/checklists', user, {
    params: { id: projectId },
    body: { checklistId: template.id },
  });
  assert.equal(same.replaced, false);
  assert.equal(same.checklists.length, 1);

  const itemId = link.items[0].id;
  const answered = await call('PATCH /api/project-checklists/:id/items/:itemId', user, {
    params: { id: link.id, itemId },
    body: { status: 'Fail', note: 'CSP missing on the legacy host' },
  });
  assert.equal(answered.item.status, 'Fail');
  assert.equal(answered.progress.answered, 1);
  assert.equal(answered.progress.fail, 1);

  // A status the vocabulary does not contain is a 400, not a silent 'Open'.
  await assert.rejects(
    () =>
      call('PATCH /api/project-checklists/:id/items/:itemId', user, {
        params: { id: link.id, itemId },
        body: { status: 'Maybe' },
      }),
    { status: 400 }
  );

  // Re-answering the same value must not move updated_at.
  const again = await call('PATCH /api/project-checklists/:id/items/:itemId', user, {
    params: { id: link.id, itemId },
    body: { status: 'Fail', note: 'CSP missing on the legacy host' },
  });
  assert.equal(again.item.updatedAt, answered.item.updatedAt);

  // A template in use cannot be deleted, and the message says why.
  await assert.rejects(() => call('DELETE /api/checklists/:id', leadUser, { params: { id: template.id } }), (err) => {
    assert.equal(err.status, 409);
    assert.match(err.message, /used by 1 project/);
    return true;
  });

  // Replacing a checklist destroys its answers, so it follows the same rule as
  // detaching: a Member may not, a lead may.
  const otherTemplate = (await call('GET /api/checklists', user)).checklists.find(
    (c) => c.id !== template.id
  );
  await assert.rejects(
    () =>
      call('POST /api/projects/:id/checklists', user, {
        params: { id: projectId },
        body: { checklistId: otherTemplate.id },
      }),
    { status: 403 }
  );

  // Detaching destroys work, so a Member cannot; a lead can, and is told how much.
  await assert.rejects(
    () => call('DELETE /api/project-checklists/:id', user, { params: { id: link.id } }),
    { status: 403 }
  );
  const detached = await call('DELETE /api/project-checklists/:id', leadUser, {
    params: { id: link.id },
  });
  assert.equal(detached.answered, 1);

  const remaining = await call('GET /api/projects/:id/checklists', user, { params: { id: projectId } });
  assert.ok(!remaining.checklists.some((c) => c.id === link.id));

  // With nothing using it, the template is deletable again.
  const throwaway = await call('POST /api/checklists', leadUser, { body: { name: 'Disposable list' } });
  await call('DELETE /api/checklists/:id', leadUser, { params: { id: throwaway.checklist.id } });
});

test('an answer cannot borrow a file from another project', async () => {
  const user = await lead();
  const first = await call('POST /api/projects', user, {
    body: { name: 'Owner of the file', clientId: 1 },
  });
  const second = await call('POST /api/projects', user, {
    body: { name: 'Borrower', clientId: 1 },
  });
  const file = await call('POST /api/projects/:id/files', user, {
    params: { id: first.project.id },
    body: { name: 'evidence.png', data: Buffer.from('png').toString('base64') },
  });
  const { checklists } = await call('GET /api/checklists', user);
  const attached = await call('POST /api/projects/:id/checklists', user, {
    params: { id: second.project.id },
    body: { checklistId: checklists[0].id },
  });
  const link = attached.checklists[0];

  await assert.rejects(
    () =>
      call('PATCH /api/project-checklists/:id/items/:itemId', user, {
        params: { id: link.id, itemId: link.items[0].id },
        body: { status: 'Fail', fileId: file.file.id },
      }),
    (err) => err.status === 400 && /different project/.test(err.message)
  );
});

test('pentest notes: one field per project, and a no-op save does not touch the stamp', async () => {
  const admin = await asUser('admin');
  const projects = await call('GET /api/projects', admin);
  const project = projects.projects[0];

  const first = await call('PUT /api/projects/:id/pentest-notes', admin, {
    params: { id: project.id },
    body: { body: 'Replayed a session cookie after logout; the API accepted it.' },
  });
  assert.match(first.project.pentestNotes, /session cookie/);
  assert.equal(first.project.pentestNotes.split('\n').length, 1);

  // Saving again replaces it — there is one note, so there is one row's worth of
  // text and the old one is not appended to.
  const second = await call('PUT /api/projects/:id/pentest-notes', admin, {
    params: { id: project.id },
    body: { body: 'Walked the object-id space on /api/invoices.' },
  });
  assert.equal(second.project.pentestNotes, 'Walked the object-id space on /api/invoices.');
  assert.doesNotMatch(second.project.pentestNotes, /session cookie/);

  // Pinned first, so a pass cannot come from two writes landing in the same
  // millisecond.
  await db.run(`UPDATE projects SET updated_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`, [project.id]);
  const same = await call('PUT /api/projects/:id/pentest-notes', admin, {
    params: { id: project.id },
    body: { body: second.project.pentestNotes },
  });
  assert.equal(same.project.updatedAt, '2020-01-01T00:00:00.000Z', 'a no-op save is not an edit');

  const edited = await call('PUT /api/projects/:id/pentest-notes', admin, {
    params: { id: project.id },
    body: { body: 'Walked the object-id space on /api/invoices. Fixed in the retest.' },
  });
  assert.notEqual(edited.project.updatedAt, '2020-01-01T00:00:00.000Z');
  assert.match(edited.project.pentestNotes, /Fixed in the retest/);

  // The working note and the scope note are different fields: writing one must
  // not clear the other, which is the failure a shared column would hide.
  const scope = await call('GET /api/projects/:id', admin, { params: { id: project.id } });
  assert.ok(scope.project.notes.length > 0, 'the scope notes were blanked by a working-note save');
  assert.notEqual(scope.project.notes, scope.project.pentestNotes);

  // Empty is how a note is cleared, exactly like the scope notes: one field, so
  // removing its text is the removal. No delete button, and no 400 either.
  const cleared = await call('PUT /api/projects/:id/pentest-notes', admin, {
    params: { id: project.id },
    body: { body: '   ' },
  });
  assert.equal(cleared.project.pentestNotes, '');
  assert.equal(cleared.cleared, true);

  // A Member writes notes — that is the job — so this one is deliberately open
  // to everyone signed in, unlike deletes.
  const member = await asUser('bagas');
  const byMember = await call('PUT /api/projects/:id/pentest-notes', member, {
    params: { id: project.id },
    body: { body: 'Checked the login throttle by hand.' },
  });
  assert.match(byMember.project.pentestNotes, /login throttle/);

  const after = await call('GET /api/projects/:id', admin, { params: { id: project.id } });
  assert.ok(after.project.notes.length > 0, 'clearing the working note also cleared the scope notes');
});

test('a working note saved in the same millisecond as the last one still persists', async () => {
  const admin = await asUser('admin');
  const projects = await call('GET /api/projects', admin);
  const project = projects.projects[0];

  // The bug this pins: the route used `editStamp(row, next) !== row.updated_at`
  // as "did anything change". When the clock had not moved since the previous
  // save, a genuinely different note produced a stamp equal to the row's, the
  // write was skipped, and the note was silently dropped while the UI said it
  // saved. Back-to-back saves are the cheapest way to land in one millisecond,
  // so five of them with distinct text make the collision very likely — and the
  // assertion is on the stored text, which the buggy version lost.
  let text = '';
  for (let i = 1; i <= 5; i += 1) {
    text = `Note number ${i}.`;
    const saved = await call('PUT /api/projects/:id/pentest-notes', admin, {
      params: { id: project.id },
      body: { body: text },
    });
    assert.equal(saved.project.pentestNotes, text);
    const read = await call('GET /api/projects/:id', admin, { params: { id: project.id } });
    assert.equal(read.project.pentestNotes, text, `save ${i} was dropped`);
  }
});

test('the reference libraries are readable by anyone signed in, and complete', async () => {
  // A Member opens the pages the newest person on the team reads first — the
  // method behind the checklists and what a failure looks like. Gating these
  // behind the admin panel would be the wrong trade: knowing how to test is not
  // a privilege, and an empty library is how a page ships broken.
  const who = await member();

  const { guides } = await call('GET /api/tests', who);
  assert.ok(guides.length >= 20, `expected the seeded guides, got ${guides?.length}`);
  for (const g of guides) {
    assert.ok(g.id && g.code && g.area && g.title, `guide is missing its identity: ${JSON.stringify(g.id)}`);
    assert.ok(g.what && g.what.length > 40, `${g.id} has no explanation`);
    // The reference line under the title comes from the checklist row, not from a
    // string in knowledge.js: an admin renaming a template must rename the guide's
    // citation too, and a guide whose category disagrees with its checklist would
    // group itself somewhere the project screen never is.
    assert.ok(g.checklistName, `${g.id} does not name the checklist it teaches`);
    assert.ok(g.category, `${g.id} has no category to be grouped under`);
    // A guide written by hand says what a pass looks like and what is not a
    // finding. A guide imported from the WSTG cannot: the method states neither,
    // and inventing them for 110 pages would be text nobody reviewed. Those
    // answer only for what their source does say.
    const imported = g.id.startsWith('wstg-');
    // Markdown prose since v1.31, so length is the only honest measure of "enough".
    assert.ok(
      typeof g.steps === 'string' && g.steps.trim().length >= (imported ? 40 : 200),
      `${g.id} has too few steps to be a guide`
    );
    if (!imported) {
      assert.ok(g.passes?.trim(), `${g.id} does not say what a pass looks like`);
      assert.ok(g.watch?.trim(), `${g.id} does not warn about the false positives`);
    }
  }

  // The category a guide groups itself under is the category of the checklist it
  // names, not a second field someone has to keep in step by hand.
  const { checklists } = await call('GET /api/checklists', who);
  const categoryOf = new Map(checklists.map((c) => [c.name, c.category]));
  const drifted = guides.filter((g) => categoryOf.get(g.checklistName) !== g.category).map((g) => g.id);
  assert.deepEqual(drifted, [], 'guides disagree with the category of their checklist');

  const { findings } = await call('GET /api/findings', who);
  assert.ok(findings.length >= 15, `expected the seeded findings, got ${findings?.length}`);
  for (const f of findings) {
    assert.ok(f.id && f.title && f.area, `finding is missing its identity: ${JSON.stringify(f.id)}`);
    // The three parts the page prints. A finding without an impact is a
    // complaint; without a mitigation it is not a deliverable.
    assert.ok(f.description, `${f.id} has no description`);
    assert.ok(f.impact, `${f.id} has no impact`);
    assert.ok(Array.isArray(f.mitigation) && f.mitigation.length, `${f.id} has no mitigation`);
    assert.ok(['Critical', 'High', 'Medium', 'Low'].includes(f.severity), `${f.id} has a severity the page cannot colour: ${f.severity}`);
  }

  // Every cross-link resolves, in both directions: a finding that points at a
  // guide nobody wrote is a dead button, and the page renders it as one.
  const ids = new Set(guides.map((g) => g.id));
  const dangling = findings.filter((f) => f.guide && !ids.has(f.guide)).map((f) => f.id);
  assert.deepEqual(dangling, [], 'findings point at guides that do not exist');

  const findingIds = new Set(findings.map((f) => f.id));
  assert.equal(findingIds.size, findings.length, 'duplicate finding ids make the scroll link ambiguous');

  // A finding is filed under the category of the test that proves it, and the
  // Findings page groups by that category. A finding without one would land in
  // an "Other" bucket nobody can pick from the chips.
  const areas = new Map(guides.map((g) => [g.id, g.area]));
  const uncategorised = findings.filter((f) => !f.category || f.category !== areas.get(f.guide)).map((f) => f.id);
  assert.deepEqual(uncategorised, [], 'findings do not carry the category of their guide');
});

test('a checklist item names the guide that teaches it, and the guide names where it is asked', async () => {
  // The link between a checklist row and a guide used to be a string convention
  // ("A01:2025 — ..." in one file, "A01:2025" in the other) that nothing checked.
  // It is a column now, derived from the section when the row is written, so both
  // directions are testable: item → guide, and guide → the checklists asking it.
  const who = await member();
  const { checklists } = await call('GET /api/checklists', who);
  const { guides } = await call('GET /api/tests', who);
  const ids = new Set(guides.map((g) => g.id));
  const codeOf = new Map(guides.map((g) => [g.id, g.code]));

  const linked = [];
  for (const list of checklists) {
    const full = await call('GET /api/checklists/:id', who, { params: { id: list.id } });
    for (const item of full.checklist.items) {
      assert.ok(!item.guide || ids.has(item.guide), `${item.title} points at a guide that does not exist`);
      if (!item.guide) continue;
      linked.push(item);
      // A guide is derived from the section, so a link that disagrees with the
      // section means the row was moved and kept a stale guide. A WSTG row names a
      // category rather than a Top-10 code, so it is matched against the citation
      // the guide carries instead.
      // A row that named its own guide may sit in a section whose category differs:
      // that is the admin's call, and the row keeps its own citation either way.
      if (item.guideOwned) continue;
      const sectionCode = item.section.split(/\s+[—–]\s+/)[0].trim();
      if (sectionCode.startsWith('WSTG-')) {
        const guide = guides.find((g) => g.id === item.guide);
        assert.equal(
          guide.wstg,
          sectionCode,
          `${item.title} sits in "${item.section}" but links ${item.guide}, which cites ${guide.wstg}`
        );
        assert.ok(item.wstgUrl.startsWith('https://wstg.owasp.org/'), `${item.title} carries no WSTG link`);
      } else {
        assert.ok(
          item.section.startsWith(codeOf.get(item.guide)),
          `${item.title} sits in "${item.section}" but links ${item.guide}`
        );
      }
    }
  }
  assert.ok(linked.length >= 30, `expected the shipped items to be linked, got ${linked.length}`);

  // The WSTG ships as a template of its own: twelve sections, one row per test
  // case, and every row can name the page that publishes it.
  const wstg = checklists.find((c) => c.name === 'OWASP WSTG');
  assert.ok(wstg, 'the WSTG template is not shipped');
  const full = await call('GET /api/checklists/:id', who, { params: { id: wstg.id } });
  assert.equal(new Set(full.checklist.items.map((i) => i.section)).size, 12, 'the WSTG template lost a section');
  assert.equal(full.checklist.items.length, 116, 'the WSTG template lost a test case');
  assert.deepEqual(
    full.checklist.items.filter((i) => !i.wstg || !i.wstgUrl).map((i) => i.title),
    [],
    'a WSTG row does not carry its category link'
  );

  // A seeded guide has to say where it is asked: the template that teaches it asks
  // it, and its count comes from the rows, not from a number in the seed file.
  for (const g of guides.filter((x) => x.checklistId)) {
    assert.ok(Array.isArray(g.asked), `${g.id} carries no answered-where list`);
    const own = g.asked.find((a) => a.checklistId === g.checklistId);
    assert.ok(own, `${g.id} claims ${g.checklistName} but that checklist does not ask it`);
    assert.ok(own.items >= 1, `${g.id} is asked by no item of ${own.checklistName}`);
  }
});

test('the test library is edited in the admin panel, and a cited guide cannot be deleted', async () => {
  // The guides used to be a module because nobody could edit them. They are rows
  // now, so the two things that can go wrong with an editable catalogue are worth
  // pinning: an edit must survive, and a delete must not quietly break a citation.
  const who = await asUser('rafi');
  const { checklists } = await call('GET /api/checklists', who);
  const own = checklists.find((c) => c.category === 'Web') || checklists[0];

  const created = await call('POST /api/tests', who, {
    body: {
      code: 'A99:2026',
      title: 'Server-side prototype pollution',
      checklistId: own.id,
      what: 'A parser merges user input into an object it then trusts.',
      steps: '- Send {"__proto__":{"admin":true}} to every JSON body.',
      passes: '- The merge refuses inherited keys.',
      tools: '- Burp Repeater',
      watch: '- JSON.parse on its own does not merge anything.',
    },
  });
  const guide = created.guide;
  assert.equal(guide.id, 'a99-2026', 'the id is derived once from the code');
  assert.equal(guide.title, 'Server-side prototype pollution');
  assert.equal(guide.checklistName, own.name, 'the guide names the checklist it teaches');
  assert.equal(guide.category, own.category || '', 'the category comes from that checklist');
  assert.equal(guide.steps, '- Send {"__proto__":{"admin":true}} to every JSON body.');

  const edited = await call('PATCH /api/tests/:id', who, {
    params: { id: guide.id },
    body: { title: 'Prototype pollution', steps: '- first\n- second', code: 'A98:2026' },
  });
  assert.equal(edited.guide.title, 'Prototype pollution');
  assert.equal(edited.guide.steps, '- first\n- second');
  assert.equal(edited.guide.id, 'a99-2026', 'renaming the code must not move the citation');

  const { guides } = await call('GET /api/tests', who);
  assert.ok(guides.some((g) => g.id === guide.id && g.title === 'Prototype pollution'));

  // Nothing points at the new guide, so it can go.
  const removed = await call('DELETE /api/tests/:id', who, { params: { id: guide.id } });
  assert.equal(removed.ok, true);

  // A shipped guide that a checklist row asks is refused: that pointer is the
  // link the Tests page and the project checklist share.
  const cited = guides.find((g) => g.asked.length > 0);
  await assert.rejects(
    () => call('DELETE /api/tests/:id', who, { params: { id: cited.id } }),
    /checklist item/
  );
  // And one a built-in finding cites is refused too — the findings library is
  // code, so that citation cannot be edited away from the panel.
  const uncited = guides.find((g) => g.asked.length === 0 && g.id !== guide.id);
  if (uncited) {
    await assert.rejects(
      () => call('DELETE /api/tests/:id', who, { params: { id: uncited.id } }),
      /finding/
    );
  }

  // Only a catalog manager may write.
  const plain = await asUser('bagas');
  await assert.rejects(
    () => call('POST /api/tests', plain, { body: { title: 'nope' } }),
    /admin panel/
  );
});

test('a project records its own findings, and only a lead can delete one', async () => {
  // Findings on an engagement are claims we make to a client, not a copy of the
  // reference library: they can start from a library entry and are edited after.
  const user = await member();
  const created = await call('POST /api/projects', user, {
    body: { name: 'Findings walkthrough', clientId: 1 },
  });
  const id = created.project.id;

  const made = await call('POST /api/projects/:id/findings', user, {
    params: { id },
    body: {
      title: 'Password reset token is predictable',
      likelihood: 4,
      impactScore: 3,
      description: 'Reset links are sequential per user id.',
      impact: 'An attacker can reset any account.',
      mitigation: 'Use 128 bits of CSPRNG.',
      template: 'f-critical-auth-bypass',
    },
  });
  // 4 × 3 = 12, which the matrix bands as High — the severity is the matrix's
  // answer, never the caller's.
  assert.equal(made.finding.severity, 'High');
  assert.equal(made.finding.score, 12);
  assert.equal(made.finding.status, 'Open', 'a new finding starts Open');
  assert.equal(made.finding.template, 'f-critical-auth-bypass');
  assert.ok(made.finding.createdByName, 'the author is named, not just numbered');

  const listed = await call('GET /api/projects/:id/findings', user, { params: { id } });
  assert.equal(listed.findings.length, 1);

  const edited = await call('PATCH /api/findings/:id', user, {
    params: { id: made.finding.id },
    body: { status: 'Fixed' },
  });
  assert.equal(edited.finding.status, 'Fixed');

  // A no-op save is not an edit: the project must not jump to the top of the list.
  const before = (await call('GET /api/projects/:id', user, { params: { id } })).project.updatedAt;
  const same = await call('PATCH /api/findings/:id', user, {
    params: { id: made.finding.id },
    body: { status: 'Fixed' },
  });
  assert.equal(same.finding.updatedAt, edited.finding.updatedAt);
  const after = (await call('GET /api/projects/:id', user, { params: { id } })).project.updatedAt;
  assert.equal(after, before, 'an unchanged save moved the project stamp');

  await assert.rejects(
    () => call('DELETE /api/findings/:id', user, { params: { id: made.finding.id } }),
    { status: 403 }
  );

  const chief = await lead();
  await call('DELETE /api/findings/:id', chief, { params: { id: made.finding.id } });
  const empty = await call('GET /api/projects/:id/findings', user, { params: { id } });
  assert.equal(empty.findings.length, 0);

  // A rating is required, and a level outside 1..5 is refused rather than
  // quietly banded: "6 × 6" is a mistake in the assessment, not a worse finding.
  await assert.rejects(
    () => call('POST /api/projects/:id/findings', user, { params: { id }, body: { title: 'x' } }),
    { status: 400 }
  );
  await assert.rejects(
    () =>
      call('POST /api/projects/:id/findings', user, {
        params: { id },
        body: { title: 'x', likelihood: 6, impactScore: 2 },
      }),
    { status: 400 }
  );
  // A severity sent by a caller is ignored: it is derived, so it cannot be used
  // to file a 5 × 5 as Low.
  const ignored = await call('POST /api/projects/:id/findings', user, {
    params: { id },
    body: { title: 'Caller-chosen severity', likelihood: 5, impactScore: 5, severity: 'Low' },
  });
  assert.equal(ignored.finding.severity, 'Critical');
  await call('DELETE /api/findings/:id', chief, { params: { id: ignored.finding.id } });
  await assert.rejects(() => call('POST /api/projects/:id/findings', user, { params: { id }, body: { title: '  ' } }), {
    status: 400,
  });

  await call('DELETE /api/projects/:id', chief, { params: { id } });
});
