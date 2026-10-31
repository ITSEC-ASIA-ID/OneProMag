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
