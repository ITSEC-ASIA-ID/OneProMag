import {
  SUPERVISOR_ROLES,
  assertProject,
  propertyKeys,
  requireCatalogManager,
  retestOpen
} from '../shared.js';
import { db, ENUMS, canManageCatalog } from '../db.js';
import {
  HttpError,
  nowISO,
  listUsers,
  createUser,
  getPublicUser,
  onlineUsers,
  PRESENCE_WINDOW_MS
} from '../auth.js';


/* ============================================================
   Pentester hierarchy (Admin panel)
   ------------------------------------------------------------
   `parent_id` points at the person directly above:

       Lead  (no parent)
         ├── Sub Lead  (parent = a Lead)
         └── Member    (parent = a Sub Lead or a Lead)
               └── Intern  (parent = a Member, a Sub Lead or a Lead)

   Below a lead the tree is a set, not a chain: a member answers to whoever runs
   their work, which on a small team is the lead directly, and an intern answers to
   whoever is training them. A sub lead can only ever report to a lead, so the two
   levels above stay strict.

   Validating this on the server matters: the picker in the UI only
   offers legal choices, but the API is reachable directly.
   ============================================================ */
const PARENT_SUBROLE = {
  'Sub Lead': ['Lead'],
  // A member may sit under the sub lead who runs their day-to-day work, or under the
  // lead directly when there is no sub lead between them.
  Member: ['Sub Lead', 'Lead'],
  Intern: ['Member', 'Sub Lead', 'Lead'],
};


/** "a member, a sub lead or a lead" — the phrase a human gets for a bad parent. */
function parentNames(subrole) {
  const names = (PARENT_SUBROLE[subrole] || []).map((s) => `${article(s)} ${s.toLowerCase()}`);
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}


/** "an Intern", "a Member" — used so error copy reads like a sentence. */
function article(word) {
  return /^[aeiou]/i.test(String(word)) ? 'an' : 'a';
}


async function validateParent(subrole, parentId, selfId = null) {
  const allowed = PARENT_SUBROLE[subrole];
  // A Lead sits at the top of the tree, so it can never have a parent.
  if (!allowed) {
    if (parentId) throw new HttpError(400, 'A lead does not report to anyone');
    return null;
  }
  if (!parentId) {
    throw new HttpError(400, `${article(subrole)} ${subrole} must report to ${parentNames(subrole)}`);
  }
  const id = Number(parentId);
  if (selfId && id === Number(selfId)) {
    throw new HttpError(400, 'A pentester cannot report to themselves');
  }
  const parent = await db.get('SELECT id, name, subrole, parent_id FROM users WHERE id = ?', [id]);
  if (!parent) throw new HttpError(400, 'That supervisor does not exist');
  if (!allowed.includes(parent.subrole)) {
    throw new HttpError(
      400,
      `${article(subrole)} ${subrole} must report to ${parentNames(subrole)}, not ${article(
        parent.subrole
      )} ${parent.subrole.toLowerCase()}`
    );
  }
  // Guard against a cycle: walk up from the proposed parent.
  let cursor = parent;
  for (let depth = 0; cursor && depth < 12; depth++) {
    if (selfId && Number(cursor.id) === Number(selfId)) {
      throw new HttpError(400, 'That would create a reporting loop');
    }
    cursor = cursor.parent_id
      ? await db.get('SELECT id, parent_id, subrole FROM users WHERE id = ?', [cursor.parent_id])
      : null;
  }
  return id;
}


/** Users as a nested tree: [{...lead, children:[{...subLead, children:[...members]}]}] */
function shapePentester(row) {
  return {
    id: Number(row.id),
    username: row.username,
    name: row.name,
    role: row.role,
    subrole: row.subrole || 'Member',
    // listUsers() returns raw columns, so normalise snake_case -> camelCase.
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    availability: row.availability || '',
    availabilityNote: row.availability_note || '',
    phone: row.phone || '',
    email: row.email || '',
  };
}


function buildPentesterTree(users) {
  const byId = new Map(users.map((u) => [Number(u.id), { ...u, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(Number(node.parentId)) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const rank = ENUMS.subroleRank;
  const sortTree = (list) => {
    list.sort(
      (a, b) =>
        (rank[a.subrole] ?? 9) - (rank[b.subrole] ?? 9) ||
        String(a.name).localeCompare(String(b.name))
    );
    list.forEach((n) => sortTree(n.children));
  };
  sortTree(roots);
  return roots;
}


/* ============================================================
   Availability board
   ------------------------------------------------------------
   Every pentester has one row. The status is AUTOMATIC unless a
   manual value is stored on the user:

       manual value set  ->  show it (Leave / Exam / Research-Learning / Other)
       no manual value   ->  On Project if they sit on at least one project
                             that is not Done, otherwise Idle

   `idle_since` is the last day the person finished a piece of work:
   the newest ended_at among their projects, falling back to the
   newest ended_at among their retests. When they move back onto a
   project that clock is simply not displayed any more.
   ============================================================ */
function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}


/** Whole days between an ISO date (YYYY-MM-DD) and today. 0 when unknown. */
function daysSince(iso) {
  if (!iso) return 0;
  const then = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  const now = new Date(`${todayISO()}T00:00:00`);
  const diff = Math.round((now.getTime() - then.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}


async function activeAssignments() {
  const rows = await db.all(
    `SELECT pp.user_id, p.id AS project_id, p.name AS project_name, p.status
       FROM project_pentesters pp
       JOIN projects p ON p.id = pp.project_id`
  );
  const byUser = new Map();
  for (const row of rows) {
    const uid = Number(row.user_id);
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push({
      id: Number(row.project_id),
      name: row.project_name,
      status: row.status,
    });
  }
  return byUser;
}


/** Newest completion date per user, across projects and retests. */
async function lastFinishedByUser() {
  const projectRows = await db.all(
    `SELECT pp.user_id, MAX(p.ended_at) AS last_end
       FROM project_pentesters pp
       JOIN projects p ON p.id = pp.project_id
      WHERE p.ended_at IS NOT NULL AND p.ended_at <> ''
      GROUP BY pp.user_id`
  );
  const retestRows = await db.all(
    `SELECT pp.user_id, MAX(r.ended_at) AS last_end
       FROM project_pentesters pp
       JOIN retests r ON r.project_id = pp.project_id
      WHERE r.ended_at IS NOT NULL AND r.ended_at <> ''
      GROUP BY pp.user_id`
  );
  const out = new Map();
  for (const row of [...projectRows, ...retestRows]) {
    const uid = Number(row.user_id);
    const prev = out.get(uid);
    if (!prev || String(row.last_end) > String(prev)) out.set(uid, String(row.last_end));
  }
  return out;
}


async function openRetestsByProject() {
  const rows = await db.all(
    `SELECT id, project_id, code, title, status
       FROM retests
      WHERE status <> 'Done'`
  );
  const byProject = new Map();
  for (const row of rows) {
    const pid = Number(row.project_id);
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push({
      id: Number(row.id),
      code: row.code,
      title: row.title,
      status: row.status,
    });
  }
  return byProject;
}


async function buildBoard() {
  // The board is the testing bench, so it holds the people who do the testing:
  // Supervisors own engagements rather than test them, and Administrators are
  // operations — both are lookup entries (Users, Manage users), not rows here.
  // A team whose only Lead is an admin therefore starts at sub-lead level; the
  // hierarchy order degrades to "whoever has no parent shown first", never to a
  // missing person.
  const users = (await listUsers())
    .map(shapePentester)
    .filter((u) => u.role !== 'Project Manager' && u.role !== 'Admin');
  const assignments = await activeAssignments();
  const openRetests = await openRetestsByProject();
  const lastFinished = await lastFinishedByUser();
  return users.map((u) => {
    const all = assignments.get(u.id) || [];
    const current = all.filter((p) => p.status !== 'Done');
    // Retests hang off the project: whoever is on the project does them. They are
    // listed separately so the board can print them as "Retest - <project>" instead
    // of pretending they are another engagement.
    //
    // Drawn from EVERY assigned project, not just the unfinished ones: the usual
    // life of a retest is "the engagement closed, the client asked for another
    // pass", so filtering out Done projects would hide exactly the work this
    // column exists to show.
    const retests = all
      .flatMap((p) =>
        (openRetests.get(Number(p.id)) || []).map((r) => ({
          ...r,
          projectId: Number(p.id),
          projectName: p.name,
        }))
      )
      .sort((a, b) => a.projectName.localeCompare(b.projectName) || a.id - b.id);
    const manual = u.availability || '';
    // A retest is work: a pentester with one open retest is on a project even when
    // the engagement it belongs to is already finished. Without this the board
    // reported them idle and the idle clock started running against them.
    const busy = current.length > 0 || retests.length > 0;
    const autoStatus = busy ? 'On Project' : 'Idle';
    const status = manual || autoStatus;
    // While idle the count must start from the moment they actually BECAME
    // idle: the end date of the last project they closed. A pentester with no
    // closed project on record has no evidence of when that happened, so their
    // idle clock starts today rather than showing a blank date.
    const idleSince =
      status === 'Idle' ? lastFinished.get(u.id) || todayISO() : lastFinished.get(u.id) || '';
    return {
      ...u,
      status,
      automatic: !manual,
      currentProjects: current,
      currentRetests: retests,
      activeCount: current.length + retests.length,
      idleSince,
    };
  });
}


/** Sort order: hierarchy first (Lead, then a sub lead with their members, …). */
function orderBoard(rows) {
  const rank = ENUMS.subroleRank;
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const ordered = [];
  const leads = rows
    .filter((r) => !r.parentId || !byId.has(Number(r.parentId)))
    .sort((a, b) => (rank[a.subrole] ?? 9) - (rank[b.subrole] ?? 9) || a.name.localeCompare(b.name));
  const walk = (node) => {
    ordered.push(node);
    const kids = rows
      .filter((r) => Number(r.parentId) === Number(node.id))
      .sort((a, b) => (rank[a.subrole] ?? 9) - (rank[b.subrole] ?? 9) || a.name.localeCompare(b.name));
    kids.forEach(walk);
  };
  leads.forEach(walk);
  // Anyone unreachable through the tree still gets listed, never silently lost.
  rows.forEach((r) => {
    if (!ordered.includes(r)) ordered.push(r);
  });
  return ordered;
}


/** Member may only change their own row; Admin / Lead / Sub Lead may change anyone. */
function canEditAvailability(actor, targetId) {
  if (!actor) return false;
  if (canManageCatalog(actor)) return true;
  return Number(actor.id) === Number(targetId);
}


/* ============================================================
   routes
   ============================================================ */
export const routes = {
  // Feeds the "who pentest" picker, so it only ever returns Pentesters.
  // Supervisors have their own endpoint: mixing them in would let a SV be
  // assigned as a tester and would break the hierarchy badges.
  /**
   * Who is online. Readable like the directory is: knowing whether a lead is at
   * their desk is the difference between a two-minute answer and an afternoon of
   * waiting.
   */
  'GET /api/presence': async (ctx) => {
    const rows = await onlineUsers();
    return {
      online: rows.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        subrole: r.subrole || 'Member',
        lastSeenAt: r.last_seen_at,
        self: Number(r.id) === Number(ctx.user.id),
      })),
      count: rows.length,
      windowSeconds: Math.round(PRESENCE_WINDOW_MS / 1000),
    };
  },


  'GET /api/users': async () => ({
    users: (await listUsers()).map(shapePentester).filter((u) => u.role === 'Pentester'),
  }),


  /**
   * The staff directory: every account with a login, for the read-only Users page.
   *
   * Any signed-in user may read it. That is the same rule as `GET /api/people/:id`
   * below and for the same reason: a colleague's office phone and e-mail is not
   * private data, and the whole point of the page is that a tester can reach the
   * project supervisor who owns the engagement. Writes stay behind their own guards.
   *
   * Unlike `/api/users` this is NOT filtered by role — it answers "who works here",
   * not "who can be assigned to a pentest", so admins belong in it too.
   */
  'GET /api/directory': async () => {
    const rows = await db.all(
      'SELECT id, username, name, role, subrole, email, phone FROM users'
    );
    return {
      users: rows
        .map(shapePentester)
        // A directory is read alphabetically. The tree has its own order for the
        // same people; hierarchy is the wrong shape when you are looking someone up.
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    };
  },


  /**
   * One person's card, for the click-through from a SV or pentester avatar.
   * Any signed-in user may look this up — the drawer already shows teammates'
   * names, and the contact details here are the office phone and e-mail of a
   * colleague, not private data. Writes stay behind their own guards.
   */
  'GET /api/people/:id': async (ctx) => {
    const row = await db.get(
      `SELECT id, username, name, role, subrole, parent_id, availability, availability_note, phone, email, created_at
         FROM users WHERE id = ?`,
      [ctx.params.id]
    );
    if (!row) throw new HttpError(404, 'Person not found');

    const person = shapePentester(row);

    // What they own vs. what they test, split so the card can label it properly.
    const managing = await db.all(
      `SELECT p.id, p.name, p.status, p.client
         FROM projects p WHERE p.supervisor_id = ?
        ORDER BY CASE p.status WHEN 'Ongoing' THEN 0 WHEN 'Incoming' THEN 1 WHEN 'Ready' THEN 2
                               WHEN 'Hold' THEN 3 WHEN 'Done' THEN 4 ELSE 5 END,
                 p.name`,
      [person.id]
    );
    const testing = await db.all(
      `SELECT p.id, p.name, p.status, p.client
         FROM project_pentesters pp JOIN projects p ON p.id = pp.project_id
        WHERE pp.user_id = ?
        ORDER BY CASE p.status WHEN 'Ongoing' THEN 0 WHEN 'Incoming' THEN 1 WHEN 'Ready' THEN 2
                               WHEN 'Hold' THEN 3 WHEN 'Done' THEN 4 ELSE 5 END,
                 p.name`,
      [person.id]
    );
    const reports = await db.all(
      `SELECT id, name, subrole FROM users WHERE parent_id = ? ORDER BY name`,
      [person.id]
    );

    const mapProject = (p) => ({
      id: Number(p.id),
      name: p.name,
      status: p.status,
      client: p.client || '',
    });

    const assignMap = await activeAssignments();
    const live = (assignMap.get(person.id) || []).filter((p) => p.status !== 'Done');
    // A Supervisor is not on the testing bench, so "Idle / On Project"
    // (which counts project_pentesters rows) would always say Idle for them.
    // Their load is the engagements they own instead.
    const owned = managing.map(mapProject).filter((p) => p.status !== 'Done');
    const derived = person.availability || (person.role === 'Project Manager'
      ? owned.length ? 'On Project' : 'Idle'
      : live.length ? 'On Project' : 'Idle');

    return {
      person: {
        ...person,
        createdAt: row.created_at,
        status: derived,
        automatic: !person.availability,
        currentProjects: person.role === 'Project Manager' ? owned : live,
      },
      supervisorOf: managing.map(mapProject),
      pentesterOn: testing.map(mapProject),
      reports: reports.map((r) => ({ id: Number(r.id), name: r.name, subrole: r.subrole || 'Member' })),
    };
  },


  /**
   * The pool of people who may supervise: Supervisor accounts first, then the
   * pentesters, because supervising is now a hat a pentester can wear rather than a
   * separate job. `pool: true` tells the picker to label each row with its role.
   */
  'GET /api/supervisors': async () => {
    const rank = { 'Project Manager': 0, Pentester: 1 };
    const supervisors = (await listUsers())
      .map(shapePentester)
      .filter((u) => SUPERVISOR_ROLES.includes(u.role))
      .sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9) || a.name.localeCompare(b.name));
    return { supervisors };
  },


  'GET /api/stats': async (ctx) => {
    const total = Number((await db.get('SELECT COUNT(*) AS n FROM projects'))?.n ?? 0);

    // ---- per-scope counters -------------------------------------------------
    // The four stat cards have to change when the scope changes: on "My active
    // projects" they must describe YOUR engagements, not the whole company's.
    // Every number below is produced by ONE query shape with an optional
    // "this project has me on it" clause, so the all-people and just-me
    // variants can never drift apart.
    //
    // `me` is the JOIN fragment, `meParam` its bound value, `meJoin` aliasing.
    const scopeStats = async (userId) => {
      const mine = userId == null ? '' : 'AND EXISTS (SELECT 1 FROM project_pentesters pp WHERE pp.project_id = p.id AND pp.user_id = ?)';
      const args = userId == null ? [] : [userId];

      const row = await db.get(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN p.status = 'Ready' THEN 1 ELSE 0 END) AS ready,
           -- Active counts ENGAGEMENTS still in flight. A finished engagement with
           -- a pending retest is not one of them any more: the retest has its own
           -- queue counter, and in the list it has its own rows. Counting it here
           -- made the badge say 5 while the list showed 4 project rows.
           SUM(CASE WHEN p.status <> 'Done' THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN EXISTS (SELECT 1 FROM retests r WHERE r.project_id = p.id AND ${retestOpen('r')})
                    THEN 1 ELSE 0 END) AS queue,
           SUM(CASE WHEN p.status = 'Ongoing' THEN 1 ELSE 0 END) AS ongoing,
           SUM(CASE WHEN p.category = 'Mobile' THEN 1 ELSE 0 END) AS mobile
         FROM projects p
         WHERE 1 = 1 ${mine}`,
        args
      );
      // Open retest REQUESTS, not projects that have one — the card counts
      // requests, so a single project with three open retests must read as 3.
      const openRow = await db.get(
        `SELECT COUNT(*) AS n FROM retests r
           JOIN projects p ON p.id = r.project_id
          WHERE ${retestOpen('r')} ${mine}`,
        args
      );
      // SUM() over zero rows is NULL, not 0 — normalise every counter.
      const n = (v) => Number(v ?? 0);
      return {
        total: n(row?.total),
        ready: n(row?.ready),
        active: n(row?.active),
        queue: n(row?.queue),
        ongoing: n(row?.ongoing),
        mobile: n(row?.mobile),
        openRetests: n(openRow?.n),
      };
    };

    const scopes = {
      all: await scopeStats(null),
      mine: await scopeStats(ctx.user.id),
    };

    // Seeded from the live property list, so a status the admin added shows a
    // zero instead of vanishing from the payload.
    const byStatus = Object.fromEntries((await propertyKeys('status')).map((s) => [s, 0]));
    for (const row of await db.all('SELECT status, COUNT(*) AS n FROM projects GROUP BY status')) {
      byStatus[row.status] = Number(row.n);
    }

    const byCategory = Object.fromEntries((await propertyKeys('category')).map((c) => [c, 0]));
    for (const row of await db.all('SELECT category, COUNT(*) AS n FROM projects GROUP BY category')) {
      byCategory[row.category] = Number(row.n);
    }

    const retests = Number((await db.get('SELECT COUNT(*) AS n FROM retests'))?.n ?? 0);
    const openRetests = Number(
      (await db.get("SELECT COUNT(*) AS n FROM retests WHERE status <> 'Done'"))?.n ?? 0
    );
    const prod = Number(
      (await db.get("SELECT COUNT(*) AS n FROM projects WHERE env = 'Prod'"))?.n ?? 0
    );
    // Active and Done are one split of the ENGAGEMENTS: everything not Done is
    // active, everything Done is done. They add up to the total, which is what a
    // reader of the cards expects.
    //
    // A finished engagement that still owes a retest is an engagement that is
    // Done — the retest is the open work, and it has its own rows in the list and
    // its own counter in the retest queue card. Counting it as active too made the
    // badge read 5 while the list showed 4 project rows.
    const byStatusCounts = await db.all('SELECT status, COUNT(*) AS n FROM projects GROUP BY status');
    const done = Number(
      byStatusCounts.filter((r) => r.status === 'Done').reduce((sum, r) => sum + Number(r.n), 0)
    );
    const active = Number(
      byStatusCounts.filter((r) => r.status !== 'Done').reduce((sum, r) => sum + Number(r.n), 0)
    );

    const clients = (
      await db.all('SELECT COUNT(*) AS n FROM clients')
    )[0]?.n ?? 0;
    const pentesters = Number(
      (await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'Pentester'"))?.n ?? 0
    );
    const supervisors = Number(
      (await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'Project Manager'"))?.n ?? 0
    );
    const applications = (
      await db.all('SELECT COUNT(*) AS n FROM applications')
    )[0]?.n ?? 0;
    const devices = Number((await db.get('SELECT COUNT(*) AS n FROM devices'))?.n ?? 0);

    // The two "My ..." scopes need their own totals for the sidebar, and they
    // must use EXACTLY the same predicate as GET /api/projects?mine=1 — a count
    // that disagrees with the list it links to is worse than no count at all.
    const mineActiveRows = await db.all(
      `SELECT COUNT(*) AS n FROM projects p
        WHERE EXISTS (SELECT 1 FROM project_pentesters pp WHERE pp.project_id = p.id AND pp.user_id = ?)
          AND (p.status <> 'Done'
               OR EXISTS (SELECT 1 FROM retests r
                           WHERE r.project_id = p.id AND ${retestOpen('r')}))`,
      [ctx.user.id]
    );
    const mineAllRows = await db.all(
      `SELECT COUNT(*) AS n FROM projects p
        WHERE EXISTS (SELECT 1 FROM project_pentesters pp WHERE pp.project_id = p.id AND pp.user_id = ?)`,
      [ctx.user.id]
    );
    const mineActive = Number(mineActiveRows[0]?.n ?? 0);
    const mineAll = Number(mineAllRows[0]?.n ?? 0);

    // Projects queued for retest: at least one open client retest request.
    const queue = (
      await db.get(
        `SELECT COUNT(*) AS n FROM projects p
          WHERE EXISTS (SELECT 1 FROM retests r WHERE r.project_id = p.id AND ${retestOpen('r')})`
      )
    )?.n ?? 0;

    return {
      total,
      active,
      done,
      byStatus,
      byCategory,
      retests,
      openRetests,
      prod,
      clients: Number(clients),
      applications: Number(applications),
      devices,
      pentesters,
      supervisors,
      mineActive,
      mineAll,
      scopes,
      queue: Number(queue),
      canManageCatalog: canManageCatalog(ctx?.user),
    };
  },


  /* ---------- availability board ---------- */

  'GET /api/availability': async () => {
    const board = orderBoard(await buildBoard());
    const idle = board.filter((r) => r.status === 'Idle');
    return {
      board,
      totals: {
        people: board.length,
        idle: idle.length,
        onProject: board.filter((r) => r.status === 'On Project').length,
        unavailable: board.filter((r) => !r.automatic && r.status !== 'On Project' && r.status !== 'Idle')
          .length,
        // "There are also total idle" — this is the headline number, plus the
        // combined idle time so a supervisor can see the whole bench at a glance.
        idleDays: idle.reduce((sum, r) => sum + daysSince(r.idleSince), 0),
      },
    };
  },


  'PATCH /api/availability/:id': async (ctx) => {
    const id = Number(ctx.params.id);
    const row = await db.get(
      'SELECT id, username, name, role, subrole, parent_id, availability, availability_note FROM users WHERE id = ?',
      [id]
    );
    if (!row) throw new HttpError(404, 'Pentester not found');
    if (!canEditAvailability(ctx.user, row.id)) {
      throw new HttpError(403, 'You can only change your own availability');
    }
    const body = ctx.body || {};
    const next =
      body.status === undefined
        ? row.availability || ''
        : String(body.status || '').trim();
    if (!ENUMS.availability.includes(next)) {
      throw new HttpError(400, `Status must be one of: ${ENUMS.availability.filter(Boolean).join(', ')}`);
    }
    const note =
      body.note === undefined ? row.availability_note || '' : String(body.note || '').trim().slice(0, 280);
    await db.run('UPDATE users SET availability = ?, availability_note = ? WHERE id = ?', [
      next,
      note,
      id,
    ]);
    const board = orderBoard(await buildBoard());
    return { board, pentester: board.find((r) => r.id === id) || null };
  },


  /* ------------------------------------------------------------------
   * Board quick-assign: put a pentester on a project, or take them off it,
   * straight from the team board without opening the project form.
   * ------------------------------------------------------------------ */
  'POST /api/projects/:id/pentesters': async (ctx) => {
    requireCatalogManager(ctx);
    const projectId = Number(ctx.params.id);
    await assertProject(projectId);
    const userId = Number(ctx.body.userId);
    if (!userId) throw new HttpError(400, 'A pentester is required');
    const user = await db.get("SELECT id FROM users WHERE id = ? AND role = 'Pentester'", [userId]);
    if (!user) throw new HttpError(404, 'Pentester not found');
    const already = await db.get(
      'SELECT 1 AS ok FROM project_pentesters WHERE project_id = ? AND user_id = ?',
      [projectId, userId]
    );
    if (!already) {
      await db.run('INSERT INTO project_pentesters (project_id, user_id) VALUES (?, ?)', [
        projectId,
        userId,
      ]);
      await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [nowISO(), projectId]);
    }
    return { board: orderBoard(await buildBoard()) };
  },


  'DELETE /api/projects/:id/pentesters/:userId': async (ctx) => {
    requireCatalogManager(ctx);
    const projectId = Number(ctx.params.id);
    const userId = Number(ctx.params.userId);
    await assertProject(projectId);
    await db.run('DELETE FROM project_pentesters WHERE project_id = ? AND user_id = ?', [
      projectId,
      userId,
    ]);
    await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [nowISO(), projectId]);
    return { board: orderBoard(await buildBoard()) };
  },


  /* ---------- project supervisor management (Admin panel) ---------- */

  'POST /api/supervisors': async (ctx) => {
    requireCatalogManager(ctx);
    const body = ctx.body || {};
    const user = await createUser({
      username: body.username,
      name: body.name,
      password: body.password,
      role: 'Project Manager',
      // Project managers sit outside the pentest tree, so no subrole/parent is
      // validated.
      subrole: 'Member',
      parentId: null,
      phone: body.phone,
      email: body.email,
    });
    return { supervisor: user };
  },


  'PATCH /api/supervisors/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM users WHERE id = ?', [ctx.params.id]);
    if (!row || row.role !== 'Project Manager') throw new HttpError(404, 'Project manager not found');
    const body = ctx.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : row.name;
    if (!name) throw new HttpError(400, 'Name is required');
    await db.run('UPDATE users SET name = ?, phone = ?, email = ? WHERE id = ?', [
      name,
      body.phone !== undefined ? String(body.phone).trim() : row.phone || '',
      body.email !== undefined ? String(body.email).trim() : row.email || '',
      row.id,
    ]);
    return { supervisor: await getPublicUser(row.id) };
  },


  'DELETE /api/supervisors/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM users WHERE id = ?', [ctx.params.id]);
    if (!row || row.role !== 'Project Manager') throw new HttpError(404, 'Project manager not found');
    const owned = await db.get('SELECT COUNT(*) AS n FROM projects WHERE supervisor_id = ?', [row.id]);
    if (Number(owned.n) > 0) {
      throw new HttpError(
        409,
        `Cannot delete: ${owned.n} project(s) still name this person as supervisor. Reassign them first.`
      );
    }
    await db.run('DELETE FROM users WHERE id = ?', [row.id]);
    return { ok: true };
  },


  /* ---------- pentester management (Admin panel) ---------- */

  'GET /api/pentesters': async (ctx) => {
    requireCatalogManager(ctx);
    // Supervisors are a separate role: they own engagements, they do not
    // test them, so they must never appear in the pentest hierarchy. Admins can
    // still carry a pentest subrole, so they stay in the tree as before.
    const users = (await listUsers()).map(shapePentester).filter((u) => u.role !== 'Project Manager');
    return { pentesters: users, tree: buildPentesterTree(users) };
  },


  'POST /api/pentesters': async (ctx) => {
    requireCatalogManager(ctx);
    const body = ctx.body || {};
    const subrole = ENUMS.subrole.includes(body.subrole) ? body.subrole : 'Member';
    const parentId = await validateParent(subrole, body.parentId);
    const user = await createUser({
      username: body.username,
      name: body.name,
      password: body.password,
      role: 'Pentester',
      subrole,
      parentId,
      phone: body.phone,
      email: body.email,
    });
    return { pentester: user };
  },


  'PATCH /api/pentesters/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM users WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Pentester not found');
    const body = ctx.body || {};

    const subrole = ENUMS.subrole.includes(body.subrole) ? body.subrole : row.subrole;
    // Re-validate the parent whenever either the level or the supervisor changes.
    const nextParent = body.parentId !== undefined ? body.parentId : row.parent_id;
    const parentId = await validateParent(subrole, nextParent, row.id);

    const name = body.name !== undefined ? String(body.name).trim() : row.name;
    if (!name) throw new HttpError(400, 'Name is required');

    await db.run(
      'UPDATE users SET name = ?, subrole = ?, parent_id = ?, phone = ?, email = ? WHERE id = ?',
      [
        name,
        subrole,
        parentId,
        body.phone !== undefined ? String(body.phone).trim() : row.phone || '',
        body.email !== undefined ? String(body.email).trim() : row.email || '',
        row.id,
      ]
    );
    return { pentester: await getPublicUser(row.id) };
  },


  'DELETE /api/pentesters/:id': async (ctx) => {
    requireCatalogManager(ctx);
    const row = await db.get('SELECT * FROM users WHERE id = ?', [ctx.params.id]);
    if (!row) throw new HttpError(404, 'Pentester not found');
    if (Number(row.id) === Number(ctx.user.id)) {
      throw new HttpError(400, 'You cannot remove your own account');
    }
    // Reassign anyone reporting to this person before removing them, otherwise
    // the tree silently loses a branch (ON DELETE SET NULL would orphan them).
    const reports = await db.all('SELECT id, name FROM users WHERE parent_id = ?', [row.id]);
    if (reports.length) {
      throw new HttpError(
        409,
        `${row.name} still manages ${reports.length} pentester(s). Move them to another supervisor first.`
      );
    }
    const assigned = await db.get(
      'SELECT COUNT(*) AS n FROM project_pentesters WHERE user_id = ?',
      [row.id]
    );
    await db.run('DELETE FROM users WHERE id = ?', [row.id]);
    return { ok: true, unassignedFrom: Number(assigned.n) };
  },
};
