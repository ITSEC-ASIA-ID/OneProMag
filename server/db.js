import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(__dirname, 'schema');

/**
 * Engine selection.
 *   DB=postgres  -> PostgreSQL (default when DATABASE_URL / PGHOST is set)
 *   DB=sqlite    -> SQLite file (default)
 * Both paths expose the same async query API, so api.js/auth.js are engine-agnostic.
 */
export const DB_ENGINE = (() => {
  const explicit = String(process.env.DB || '').trim().toLowerCase();
  if (explicit === 'postgres' || explicit === 'postgresql' || explicit === 'pg') return 'postgres';
  if (explicit === 'sqlite') return 'sqlite';
  if (process.env.DATABASE_URL || process.env.PGHOST) return 'postgres';
  return 'sqlite';
})();

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

function readSchema(engine) {
  return fs.readFileSync(path.join(SCHEMA_DIR, `${engine}.sql`), 'utf8');
}

/**
 * The active driver, resolved by initDatabase().
 *
 * Drivers are imported DYNAMICALLY: `pg` is only required when running on
 * Postgres, so a SQLite-only deployment never needs the package installed.
 */
let driver = null;

function requireDriver() {
  if (!driver) throw new Error('Database not initialised — call initDatabase() first');
  return driver;
}

export const db = {
  get engine() {
    return driver?.engine ?? DB_ENGINE;
  },
  get rowLock() {
    return driver?.rowLock ?? '';
  },
  exec: (...args) => requireDriver().exec(...args),
  all: (...args) => requireDriver().all(...args),
  get: (...args) => requireDriver().get(...args),
  run: (...args) => requireDriver().run(...args),
  transaction: (...args) => requireDriver().transaction(...args),
  waitUntilReady: (...args) => requireDriver().waitUntilReady(...args),
  close: () => driver?.close(),
};

export const ENUMS = {
  category: ['Web', 'Mobile', 'API', 'EDC'],
  // Platform only applies to Mobile projects.
  platform: ['Android', 'iOS', 'API'],
  env: ['Dev', 'Prod'],
  method: ['Black Box', 'Grey Box', 'White Box'],
  // Display order used by the status dropdown, the segmented control and the
  // status filter. It follows the engagement lifecycle, not the pipeline rank:
  // a new request arrives, the report gets prepared, testing runs, and then the
  // project is either finished or put on hold.
  status: ['Incoming', 'Ready', 'Ongoing', 'Done', 'Hold'],
  // Project Manager is its own role: PMs own engagements and are assignable as
  // a project's manager, but they are not pentesters and never appear in the
  // "who pentest" picker.
  role: ['Pentester', 'Project Manager', 'Admin'],
  // Availability board. '' always means "automatic", never a stored choice.
  availability: ['', 'On Project', 'Idle', 'Leave', 'Exam', 'Research/Learning', 'Other'],
  // Pentester hierarchy, highest first. An intern is the trainee level below a
  // member: they test alongside whoever supervises them, and the board lists them
  // in their own table because they are not on the bench yet.
  subrole: ['Lead', 'Sub Lead', 'Member', 'Intern'],
  subroleRank: { Lead: 0, 'Sub Lead': 1, Member: 2, Intern: 3 },
};

/**
 * Device inventory.
 *
 * Each kind carries a DIFFERENT, prescribed set of fields, so this map is the
 * single authority on what a kind owns. The API filters writes through it and the
 * UI builds its form and table columns from it, which is what keeps a field from
 * being stored on a kind that would never render it.
 *
 * The order inside each array is the column order on screen — chosen to match how
 * a tester reads a device sheet (identify it, then its firmware, then who holds it,
 * then the free notes), not alphabetically.
 */
export const DEVICE_FIELDS = {
  Android: ['name', 'version', 'root', 'rom', 'whoUsed', 'notes'],
  iOS: ['name', 'version', 'uuid', 'whoUsed', 'notes'],
  EDC: [
    'name',
    'serial',
    'edcType',
    'supplier',
    'whoUsed',
    'password',
    'kernel',
    'android',
    'notes',
  ],
  Misc: ['name', 'whoUsed', 'notes'],
};

/** Labels for those fields. Kept beside the map so a field can never be added
 *  to one without the other — an unlabelled column would render its raw key. */
export const DEVICE_LABELS = {
  name: 'Name Device',
  version: 'Version',
  root: 'Root',
  rom: 'ROM',
  uuid: 'UUID',
  serial: 'Unique ID (SN)',
  edcType: 'Type',
  supplier: 'Supplier',
  whoUsed: 'Who Used',
  password: 'Password',
  kernel: 'Kernel',
  android: 'Android',
  notes: 'Notes',
};

/** Map a device field key to its database column. */
export const DEVICE_COLUMNS = {
  name: 'name',
  version: 'version',
  root: 'root',
  rom: 'rom',
  uuid: 'uuid',
  serial: 'serial',
  edcType: 'edc_type',
  supplier: 'supplier',
  whoUsed: 'who_used',
  password: 'password',
  kernel: 'kernel',
  android: 'android',
  notes: 'notes',
  // Not a user-visible field: the JSON blob holding user-added column values.
  extra: 'extra',
  // Manual drag order.
  position: 'position',
};

export const DEVICE_KINDS = Object.keys(DEVICE_FIELDS);

/**
 * Who may manage clients + applications (the Admin Panel).
 * Admins always can; among pentesters only Lead and Sub Lead.
 */
export function canManageCatalog(user) {
  if (!user) return false;
  if (user.role === 'Admin') return true;
  return user.subrole === 'Lead' || user.subrole === 'Sub Lead';
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

const now = () => new Date().toISOString();

// --- seed data -------------------------------------------------------------
// [username, name, role, subrole, password, reportsTo (username | null), availability?]
// availability '' means automatic (On Project / Idle derived from assignments).
// Two pentest branches so the availability board shows the shape it was asked
// for: Lead, Sub Lead, Member, Member, Sub Lead, Member, Member — plus two interns,
// one under a member and one under a lead, because those are the two people an
// intern is actually attached to in practice (and the board keeps them in their own
// table, so the demo has to show it non-empty).
// The last two are Project Managers: they own engagements instead of testing
// them, so they have no subrole/manager (a PM reports to nobody in the tree).
const SEED_USERS = [
  ['admin', 'Arif Wicaksono', 'Admin', 'Lead', 'admin123', null, ''],
  ['rafi', 'Rafi Pratama', 'Pentester', 'Lead', 'pentester123', null, ''],
  ['dewi', 'Dewi Lestari', 'Pentester', 'Sub Lead', 'pentester123', 'admin', ''],
  ['bagas', 'Bagas Nugroho', 'Pentester', 'Member', 'pentester123', 'dewi', ''],
  ['sinta', 'Sinta Maharani', 'Pentester', 'Member', 'pentester123', 'dewi', ''],
  ['yoga', 'Yoga Pratama', 'Pentester', 'Sub Lead', 'pentester123', 'rafi', ''],
  ['fajar', 'Fajar Ramadhan', 'Pentester', 'Member', 'pentester123', 'yoga', 'Exam'],
  ['nadia', 'Nadia Puspita', 'Pentester', 'Member', 'pentester123', 'yoga', ''],
  ['adit', 'Adit Saputra', 'Pentester', 'Intern', 'intern123', 'bagas', ''],
  ['laras', 'Laras Ayu', 'Pentester', 'Intern', 'intern123', 'rafi', ''],
  ['rina', 'Rina Kusuma', 'Project Manager', 'Member', 'manager123', null, ''],
  ['hendra', 'Hendra Wijaya', 'Project Manager', 'Member', 'manager123', null, ''],
];

// Contact details per seeded username. Kept in a separate map so the user
// tuple above stays readable.
const SEED_CONTACTS = {
  admin: ['+62 812 1000 0001', 'arif.wicaksono@onepromag.id'],
  rafi: ['+62 812 1000 0002', 'rafi.pratama@onepromag.id'],
  dewi: ['+62 812 1000 0003', 'dewi.lestari@onepromag.id'],
  bagas: ['+62 812 1000 0004', 'bagas.nugroho@onepromag.id'],
  sinta: ['+62 812 1000 0005', 'sinta.maharani@onepromag.id'],
  yoga: ['+62 812 1000 0006', 'yoga.pratama@onepromag.id'],
  fajar: ['+62 812 1000 0007', 'fajar.ramadhan@onepromag.id'],
  nadia: ['+62 812 1000 0008', 'nadia.puspita@onepromag.id'],
  adit: ['+62 812 1000 0009', 'adit.saputra@onepromag.id'],
  laras: ['+62 812 1000 0010', 'laras.ayu@onepromag.id'],
  rina: ['+62 812 2000 0001', 'rina.kusuma@onepromag.id'],
  hendra: ['+62 812 2000 0002', 'hendra.wijaya@onepromag.id'],
};

// [name, shortName, notes, applications[], defaultProjectManagers[]]
// The manager usernames are resolved after users are inserted, so a client can
// name its usual PMs here and the project form pre-selects them.
const SEED_CLIENTS = [
  [
    'Bank Nusantara',
    'BN',
    'Tier-1 bank. AppSec team contact: Hendra.',
    ['Qitta', 'Brimo', 'Brilink', 'Nusantara Corporate Portal'],
    ['rina', 'hendra'],
  ],
  [
    'PayGate Indonesia',
    'PGI',
    'Payment gateway. REST + webhook partners.',
    ['PayGate Merchant API', 'PayGate Dashboard'],
    ['hendra'],
  ],
  [
    'SecurePay Devices',
    'SPD',
    'EDC hardware vendor.',
    ['EDC Terminal Firmware', 'Key Management Service'],
    ['rina'],
  ],
  [
    'Sinergi Rekrutmen',
    'SR',
    'HR tech company.',
    ['Internal HRIS', 'Jobs Portal'],
    ['hendra'],
  ],
  [
    'Dompet Kita',
    'DK',
    'E-wallet provider.',
    ['Dompet Kita App', 'Dompet Kita Merchant'],
    ['rina', 'hendra'],
  ],
];

/**
 * Demo device inventory: one row per kind so all four tabs have something in
 * them on a fresh install. Values are plausible rather than realistic — the
 * point is to show which fields each kind carries.
 */
const SEED_DEVICES = [
  {
    kind: 'Android',
    name: 'Samsung Galaxy A54',
    version: 'Android 14',
    root: 'Rooted (Magisk 27)',
    rom: 'Stock One UI 6.1',
    whoUsed: 'Bagas Nugroho',
    notes: 'Primary Android target. frida-server 16.2 installed.',
  },
  {
    kind: 'Android',
    name: 'Xiaomi Redmi Note 12',
    version: 'Android 13',
    root: 'Not rooted',
    rom: 'LineageOS 20 (unofficial)',
    whoUsed: 'Sinta Maharani',
    notes: 'Used for non-root bypass checks.',
  },
  {
    kind: 'iOS',
    name: 'iPhone 13',
    version: 'iOS 17.4',
    uuid: 'a1b2c3d4e5f6789012345678abcdef01',
    whoUsed: 'Dewi Lestari',
    notes: 'Jailbroken via palera1n (rootless). USB restricted mode disabled.',
  },
  {
    kind: 'EDC',
    name: 'Ingenico Move/5000',
    serial: 'SN-ING-772341',
    edcType: 'Portable POS',
    supplier: 'SecurePay Devices',
    whoUsed: 'Yoga Pratama',
    password: '8241',
    kernel: 'Linux 3.10.49 (vendor BSP)',
    android: 'None — RTOS',
    notes: 'Serial port exposed under the battery. Debug menu: hold 1+5+9 on boot.',
  },
  {
    kind: 'EDC',
    name: 'Verifone VX520',
    serial: 'SN-VF-118902',
    edcType: 'Countertop POS',
    supplier: 'SecurePay Devices',
    whoUsed: 'Fajar Ramadhan',
    password: '0000',
    kernel: 'Linux 2.6.32',
    android: 'None — RTOS',
    notes: 'Default manager password still set on the staging unit.',
  },
  {
    kind: 'Misc',
    name: 'Alfa AWUS036ACH',
    whoUsed: 'Rafi Pratama',
    notes: 'External Wi-Fi adapter for rogue-AP testing. Needs the 8812au driver.',
  },
  {
    kind: 'Misc',
    name: 'Proxmark3 RDV4',
    whoUsed: 'Nadia Puspita',
    notes: 'RFID/NFC cloning. Iceman firmware, two antennas in the case.',
  },
];

function seedProjects(daysAgo) {
  return [
    {
      name: 'Core Banking Web Portal',
      client: 'Bank Nusantara',
      manager: 'rina',
      application: 'Qitta',
      category: 'Web',
      platform: '',
      env: 'Prod',
      method: 'Grey Box',
      status: 'Ongoing',
      notes:
        'Scope: internet banking, transfer, and bill payment modules.\nCreds provided on staging vault.\nOut of scope: third-party payment gateway.',
      pentesters: [2, 3],
      retests: [
        {
          title: 'Retest of Core Banking Web Portal',
          findings: '',
          requested_by: 'Hendra (Client AppSec Lead)',
          requested_at: daysAgo(9).slice(0, 10),
          status: 'Ongoing',
          notes: 'Client asked us to re-run the transfer flow after their fix. Queued for this week.',
        },
      ],
    },
    {
      name: 'Mobile Banking App v4.2',
      client: 'Bank Nusantara',
      manager: 'hendra',
      application: 'Brimo',
      category: 'Mobile',
      platform: 'Android',
      env: 'Prod',
      method: 'Black Box',
      status: 'Incoming',
      notes:
        'Android build provided via Firebase distribution.\nRoot detection and biometric flows in scope.',
      pentesters: [5],
      retests: [
        {
          title: 'Retest of Mobile Banking App v4.2',
          findings: '',
          requested_by: 'Sinta (Product Security)',
          requested_at: daysAgo(1).slice(0, 10),
          status: 'Incoming',
          notes: 'Whole app re-test, not a single finding.',
        },
      ],
    },
    {
      name: 'Brimo iOS Build',
      client: 'Bank Nusantara',
      manager: 'hendra',
      application: 'Brimo',
      category: 'Mobile',
      platform: 'iOS',
      env: 'Dev',
      method: 'Grey Box',
      status: 'Hold',
      notes: 'iOS build pending TestFlight provisioning. On hold until the client ships the IPA.',
      pentesters: [3],
      retests: [],
    },
    {
      name: 'Partner Payment API',
      client: 'PayGate Indonesia',
      manager: 'hendra',
      application: 'PayGate Merchant API',
      category: 'API',
      platform: '',
      env: 'Dev',
      method: 'White Box',
      status: 'Done',
      ended_at: daysAgo(17).slice(0, 10),
      notes:
        'REST + webhook endpoints. Source code and OpenAPI spec reviewed.\nRate limiting and signature validation in scope.',
      pentesters: [2, 4, 8],
      retests: [],
    },
    {
      name: 'EDC Terminal Firmware',
      client: 'SecurePay Devices',
      manager: 'rina',
      application: 'EDC Terminal Firmware',
      category: 'EDC',
      platform: '',
      env: 'Dev',
      method: 'Grey Box',
      status: 'Hold',
      notes:
        'On hold — device units not shipped yet by vendor.\nPlanned: physical tamper, keypad PIN pad, EMV transaction flow.',
      pentesters: [4],
      retests: [
        {
          title: 'Retest of EDC Terminal Firmware',
          findings: '',
          requested_by: 'Yusuf (Hardware Vendor)',
          requested_at: daysAgo(21).slice(0, 10),
          status: 'Hold',
          notes: 'Blocked until new firmware build arrives.',
        },
      ],
    },
    {
      name: 'Internal HRIS Web App',
      client: 'Sinergi Rekrutmen',
      manager: 'hendra',
      application: 'Internal HRIS',
      category: 'Web',
      platform: '',
      env: 'Dev',
      method: 'Black Box',
      status: 'Done',
      ended_at: daysAgo(31).slice(0, 10),
      notes: 'Annual assessment. 14 findings, 3 high.\nFinal report delivered and accepted.',
      pentesters: [2, 3, 4, 6],
      retests: [
        {
          title: 'Retest of Internal HRIS Web App',
          findings: '',
          requested_by: 'Rina (HRIS Owner)',
          requested_at: daysAgo(45).slice(0, 10),
          status: 'Done',
          notes: 'Verified on build 2024.11.3 — role check enforced server-side.',
        },
      ],
    },
    {
      name: 'Customer Mobile Wallet',
      client: 'Dompet Kita',
      manager: 'rina',
      application: 'Dompet Kita App',
      category: 'Mobile',
      platform: 'Android',
      env: 'Prod',
      method: 'Grey Box',
      status: 'Ongoing',
      notes: 'Focus: biometric auth bypass, deep link hijacking, rooted device flows.',
      pentesters: [3, 2],
      retests: [],
    },
  ];
}

/**
 * Backfills the demo devices on a database that already has users.
 *
 * The demo seed below only runs on an empty database, so a deployment that
 * predates the Devices feature would migrate its schema and then show an empty
 * inventory — the feature would look broken rather than new. This fills it once
 * and is a no-op afterwards because it checks for existing rows first.
 */
/**
 * Demo data, or an empty install?
 *
 * `seed()` fills a fresh database with fixtures: ten people, five clients, seven
 * projects, notes, retests and a hardware inventory. That is what makes the
 * development environment worth looking at, and it is the last thing a
 * production install wants to hand a real client — a "SecurePay Devices" client
 * with fake engagements is noise at best and confusing at worst.
 *
 * SEED_DEMO=0 (set by docker-compose.prod.yml) keeps everything structural:
 * the schema, the nine built-in categories and statuses (project rows reference
 * their keys, so they are not fixtures), and a single admin account, because an
 * empty users table means nobody can sign in and create anyone.
 *
 * Unset — a bare `npm start`, the SQLite fallback, the development compose file
 * — still seeds, so nothing changes for an existing workflow.
 */
/** Exported for the login screen: it may only advertise demo logins when they
 *  were actually created here. */
export const DEMO_MODE = (() => {
  const raw = String(process.env.SEED_DEMO ?? '').trim();
  if (raw === '') return true;
  return /^(1|true|yes|on)$/i.test(raw);
})();
const SEED_DEMO = DEMO_MODE;

/**
 * The one account a demo-free install gets.
 *
 * Refusing to boot without ADMIN_PASSWORD would make
 * `docker compose -f docker-compose.prod.yml up -d` impossible, which is the
 * whole point of that file, so the password is generated when it is not given
 * and printed once in the boot log. It is the account the operator signs in
 * with, then changes; `ADMIN_PASSWORD` exists for the case where the password
 * must be known in advance (provisioning, a password manager, a script).
 */
/**
 * Where the bootstrap admin's password is kept between restarts.
 *
 * It exists so the credentials can be printed on EVERY start, not only the boot
 * that created them: `docker compose up` output scrolls, `-d` shows nothing, and
 * a container rebuilt a week later has no memory of the password. It is mode
 * 0600 inside the data volume — the same trust boundary as the database itself —
 * and it is deleted the moment the password no longer matches, so no stale
 * secret is left lying around.
 *
 * Setting ADMIN_PASSWORD in .env avoids the file entirely: the password is then
 * already in the environment and can be printed from there.
 */
const BOOTSTRAP_FILE = path.join(DATA_DIR, '.bootstrap-admin.json');

export function rememberBootstrapAdmin(record) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BOOTSTRAP_FILE, JSON.stringify(record, null, 2), { mode: 0o600 });
    fs.chmodSync(BOOTSTRAP_FILE, 0o600);
  } catch {
    // A read-only data dir must not stop the app from starting; the credentials
    // were already printed once, which is the minimum viable behaviour.
  }
}

/** Drop the stored bootstrap password — called by the CLI after a reset. */
export function forgetBootstrapAdmin() {
  try {
    fs.rmSync(BOOTSTRAP_FILE, { force: true });
  } catch {
    /* already gone */
  }
}

/**
 * The admin credentials to show on this start, or null when there is nothing
 * true to show.
 *
 * "True" is checked, not assumed: the stored password is verified against the
 * hash in the database. Once the operator changes the password, the stored copy
 * stops matching, the file is removed and the boot log says the password has
 * been changed instead of printing one that no longer works.
 */
export async function bootstrapCredentials() {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const user = await db.get('SELECT username, password_hash FROM users WHERE lower(username) = ?', [
    username,
  ]);
  if (!user) return null;

  // ADMIN_PASSWORD is the source of truth when it is set: it is already in the
  // environment, so printing it needs no file at all.
  const fromEnv = String(process.env.ADMIN_PASSWORD || '').trim();
  if (fromEnv) {
    if (!verifyPassword(fromEnv, user.password_hash)) return null;
    return { username: user.username, password: fromEnv, source: 'env' };
  }

  let record = null;
  try {
    record = JSON.parse(fs.readFileSync(BOOTSTRAP_FILE, 'utf8'));
  } catch {
    return null;
  }
  if (!record?.password || String(record.username || '').toLowerCase() !== user.username) return null;
  if (!verifyPassword(String(record.password), user.password_hash)) {
    try {
      fs.rmSync(BOOTSTRAP_FILE, { force: true });
    } catch {
      /* nothing to clean up */
    }
    return null;
  }
  return { username: user.username, password: String(record.password), source: 'file' };
}

async function seedBootstrapAdmin() {
  const existing = await db.get('SELECT COUNT(*) AS n FROM users');
  if (existing && Number(existing.n) > 0) return { seeded: false };

  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || 'Administrator').trim();
  const given = String(process.env.ADMIN_PASSWORD || '').trim();
  const password = given || crypto.randomBytes(9).toString('base64url');

  await db.run(
    `INSERT INTO users (username, name, role, subrole, parent_id, availability, availability_note, phone, email, password_hash, created_at)
     VALUES (?, ?, 'Admin', 'Lead', NULL, '', '', '', '', ?, ?)`,
    [username, name, hashPassword(password), now()]
  );
  // Remembered only after the row exists, and only so later boots can print it.
  rememberBootstrapAdmin({ username, password, createdAt: now() });
  return { seeded: false, bootstrapAdmin: { username, password, generated: !given } };
}

async function seedDevicesIfEmpty() {
  const existing = await db.get('SELECT COUNT(*) AS n FROM devices');
  if (existing && Number(existing.n) > 0) return { seeded: false };
  const users = Number((await db.get('SELECT COUNT(*) AS n FROM users'))?.n ?? 0);
  // Brand-new installs get their devices from the main seed instead, so the
  // counts still line up there.
  if (users === 0) return { seeded: false };
  await db.transaction(async (tx) => {
    for (const d of SEED_DEVICES) await insertSeedDevice(tx, d);
  });
  return { seeded: true, devices: SEED_DEVICES.length };
}

async function insertSeedDevice(tx, d) {
  const cols = ['kind'];
  const vals = [d.kind];
  for (const key of Object.keys(DEVICE_COLUMNS)) {
    if (d[key] === undefined) continue;
    // Only the kind's own fields; SEED_DEVICES names them by API key.
    if (!DEVICE_FIELDS[d.kind].includes(key)) continue;
    cols.push(DEVICE_COLUMNS[key]);
    vals.push(String(d[key]));
  }
  cols.push('created_at', 'updated_at');
  vals.push(now(), now());
  await tx.run(
    `INSERT INTO devices (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    vals
  );
}

async function seed() {
  const existing = await db.get('SELECT COUNT(*) AS n FROM users');
  if (existing && Number(existing.n) > 0) return { seeded: false };

  const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();

  return db.transaction(async (tx) => {
    const userIds = [];
    const idByUsername = new Map();
    for (const [username, name, role, subrole, pass, reportsTo, availability] of SEED_USERS) {
      const [phone, email] = SEED_CONTACTS[username] || ['', ''];
      const row = await tx.get(
        `INSERT INTO users (username, name, role, subrole, parent_id, availability, availability_note, phone, email, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
          username,
          name,
          role,
          subrole,
          reportsTo ? idByUsername.get(reportsTo) ?? null : null,
          availability || '',
          availability === 'Exam' ? 'OSCP attempt scheduled next month' : '',
          phone,
          email,
          hashPassword(pass),
          now(),
        ]
      );
      const id = Number(row.id);
      userIds.push(id);
      idByUsername.set(username, id);
    }

    // clients + their applications + their default project managers
    const appIdByKey = new Map();
    for (const [name, shortName, notes, apps, managers = []] of SEED_CLIENTS) {
      const clientRow = await tx.get(
        `INSERT INTO clients (name, short_name, notes, created_at) VALUES (?, ?, ?, ?) RETURNING id`,
        [name, shortName, notes, now()]
      );
      const clientId = Number(clientRow.id);
      for (const appName of apps) {
        const appRow = await tx.get(
          `INSERT INTO applications (client_id, name, notes, created_at) VALUES (?, ?, ?, ?) RETURNING id`,
          [clientId, appName, '', now()]
        );
        appIdByKey.set(`${name}||${appName}`, Number(appRow.id));
      }
      for (const username of managers) {
        const managerId = idByUsername.get(username);
        if (managerId) {
          await tx.run('INSERT INTO client_managers (client_id, user_id) VALUES (?, ?)', [
            clientId,
            managerId,
          ]);
        }
      }
    }

    for (const p of seedProjects(daysAgo)) {
      const createdAt = daysAgo(30);
      const clientId = (
        await tx.get('SELECT id FROM clients WHERE name = ?', [p.client])
      )?.id ?? null;
      const applicationId = appIdByKey.get(`${p.client}||${p.application}`) ?? null;

      const inserted = await tx.get(
        `INSERT INTO projects (name, client, client_id, application_id, manager_id, category, platform, env, method, status, notes, created_by, created_at, updated_at, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
          p.name,
          p.client,
          clientId,
          applicationId,
          p.manager ? idByUsername.get(p.manager) ?? null : null,
          p.category,
          p.platform || '',
          p.env,
          p.method,
          p.status,
          p.notes,
          userIds[0],
          createdAt,
          daysAgo(2),
          // Demo dates so the availability board has a real "idle since".
          // Empty string, not null: the API stores `String(body.endedAt || '')`, so
          // '' is the canonical "no date" and the column can stay NOT NULL.
          p.status === 'Incoming' ? '' : (p.started_at || daysAgo(24).slice(0, 10)),
          p.status === 'Done' ? (p.ended_at || daysAgo(10).slice(0, 10)) : '',
        ]
      );
      const projectId = Number(inserted.id);

      for (const uid of p.pentesters) {
        await tx.run('INSERT INTO project_pentesters (project_id, user_id) VALUES (?, ?)', [
          projectId,
          uid,
        ]);
      }

      let seq = 0;
      for (const r of p.retests) {
        seq += 1;
        await tx.run(
          `INSERT INTO retests (project_id, code, title, findings, requested_by, requested_at, status, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            projectId,
            `RT-${String(projectId).padStart(3, '0')}-${String(seq).padStart(2, '0')}`,
            r.title,
            r.findings,
            r.requested_by,
            r.requested_at || null,
            r.status,
            r.notes,
            daysAgo(10),
            daysAgo(1),
          ]
        );
      }
    }

    // Device inventory. One row per kind so no tab starts empty.
    for (const d of SEED_DEVICES) await insertSeedDevice(tx, d);

    // A worked example of the fixed documents, on the application the demo user
    // is most likely to open first. Without it a fresh install shows two empty
    // editors and it is not obvious what they are FOR. Seeded as Dev, which is the
    // environment a tester opens first; the Prod sheet starts empty on purpose so
    // the two environments are visibly different data.
    const demoAppId = appIdByKey.get('Bank Nusantara||Brilink');
    if (demoAppId) {
      await tx.run(
        `INSERT INTO documents (scope, scope_id, env, text_body, table_json, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'application',
          demoAppId,
          'Dev',
          [
            'Access',
            '  VPN: bn-vpn.banknusantara.co.id (profile: brilink-pentest)',
            '  Bastion: 10.20.4.11 — ssh with the pentest account',
            '',
            'Test accounts',
            '  The staging build resets every Monday 03:00 WIB, so re-request',
            '  accounts on Monday morning if a login stops working.',
            '',
            'Quirks',
            '  OTP is fixed to 123456 on staging.',
            '  The agent app is throttled to 40 req/min — batch scans trip it.',
          ].join('\n'),
          JSON.stringify({
            columns: ['System', 'Username', 'Password', 'Notes'],
            rows: [
              ['Brilink web (staging)', 'pentest.web', 'Pt#Brilink24', 'Full agent role'],
              ['Admin backoffice', 'pentest.admin', 'Pt#Admin24', 'Read-only by design'],
              ['Mobile API', 'api-pentest', 'Pt#Api24', 'Bearer tokens, 8h TTL'],
            ],
          }),
          idByUsername.get('rafi') ?? userIds[0],
          daysAgo(3),
        ]
      );

      // The Prod sheet for the same application, deliberately different: real
      // credentials never live here, and seeing a distinct page is what makes the
      // Dev/Prod switch obvious to someone opening the app for the first time.
      await tx.run(
        `INSERT INTO documents (scope, scope_id, env, text_body, table_json, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'application',
          demoAppId,
          'Prod',
          [
            'Scope',
            '  Production testing is read-only unless the client signs off a',
            '  destructive test in writing. Ask the PM before anything that writes.',
            '',
            'Access',
            '  No standing production accounts. Request a time-boxed one the day',
            '  before, and hand it back the same day.',
            '',
            'Window',
            '  Changes freeze 25 Dec - 2 Jan. Nothing runs during the freeze.',
          ].join('\n'),
          JSON.stringify({
            columns: ['System', 'Account', 'Expires', 'Notes'],
            rows: [
              ['Brilink web (production)', 'pentest.prod.svc', '2026-11-02', 'Read-only role'],
              ['Admin backoffice', 'pentest.prod.admin', '2026-11-02', 'Time-boxed'],
            ],
          }),
          idByUsername.get('rafi') ?? userIds[0],
          daysAgo(1),
        ]
      );
    }

    return { seeded: true, users: SEED_USERS.length };
  });
}

/**
 * The properties every project needs to exist: four categories and five statuses.
 *
 * These are the values the code compares against — `status = 'Done'` is what makes a
 * project finished, `category = 'Mobile'` is what reveals the platform field — so they
 * are `locked`: an admin can rename them, recolour them and reorder them, but the key
 * itself is load-bearing. New categories and statuses created later are ordinary rows
 * and can be deleted while nothing uses them.
 *
 * Seeded only when the table is empty, so an existing install gains the rows once and
 * never has them re-added after an admin deletes a property they added.
 */
const DEFAULT_PROPERTIES = [
  { kind: 'category', key: 'Web', label: 'Web', tone: 'blue', position: 0, locked: true },
  { kind: 'category', key: 'Mobile', label: 'Mobile', tone: 'violet', position: 1, locked: true },
  { kind: 'category', key: 'API', label: 'API', tone: 'cyan', position: 2, locked: true },
  { kind: 'category', key: 'EDC', label: 'EDC', tone: 'amber', position: 3, locked: true },
  { kind: 'status', key: 'Incoming', label: 'Incoming', tone: 'blue', position: 0, locked: true },
  { kind: 'status', key: 'Ready', label: 'Ready', tone: 'violet', position: 1, locked: true },
  { kind: 'status', key: 'Ongoing', label: 'Ongoing', tone: 'amber', position: 2, locked: true },
  { kind: 'status', key: 'Done', label: 'Done', tone: 'green', position: 3, locked: true },
  { kind: 'status', key: 'Hold', label: 'Hold', tone: 'slate', position: 4, locked: true },
];

/**
 * Writes the nine built-in categories and statuses.
 *
 * Per row, not all-or-nothing on `COUNT(*) > 0`. The old guard meant a process
 * killed halfway through the nine inserts left four rows, and every later boot
 * saw "there is already a property" and inserted nothing more. If the missing row
 * happened to be `Done`, no project could ever be marked finished again
 * (`pickProperty('status', 'Done', …)` silently falls back to the current status)
 * and the locked rows cannot be deleted through the UI, so an admin could not
 * repair it. `ON CONFLICT DO NOTHING` on the live `UNIQUE (kind, key)` makes each
 * row independently idempotent and makes the count guard unnecessary.
 */
async function seedPropertiesIfEmpty() {
  const stamp = now();
  let inserted = 0;
  await db.transaction(async (tx) => {
    for (const p of DEFAULT_PROPERTIES) {
      const info = await tx.run(
        `INSERT INTO properties (kind, key, label, tone, position, locked, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (kind, key) DO NOTHING`,
        [p.kind, p.key, p.label, p.tone, p.position, p.locked ? 1 : 0, stamp]
      );
      inserted += info.rowCount || 0;
    }
  });
  return { seeded: inserted > 0, properties: inserted };
}

/**
 * The shape of the schema this release expects.
 *
 * Bumped by hand whenever the schema files or the boot migrations change. It is
 * recorded in `schema_migrations` so an operator can ask a volume what it has been
 * through (`SELECT max(version) FROM schema_migrations`), which is the question the
 * create-if-not-exists approach could not answer at all.
 *
 * 12 — retest rows in the active lists, paging, properties, documents per env.
 */
export const SCHEMA_VERSION = 12;

let appliedSchemaVersion = 0;

export function schemaVersion() {
  return appliedSchemaVersion;
}

/**
 * Stamps this boot's schema version and, more importantly, refuses to start on a
 * half-migrated database. Called after the migrations, before the seed.
 */
async function recordSchemaVersion() {
  if (failedMigrations.length) {
    throw new Error(
      `schema migration incomplete (${failedMigrations.length} step(s) failed): ${failedMigrations.join(
        ' | '
      )} — refusing to start on a half-migrated database; fix the cause and restart`
    );
  }
  await db.run(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?) ON CONFLICT (version) DO NOTHING',
    [SCHEMA_VERSION, now()]
  );
  appliedSchemaVersion = SCHEMA_VERSION;
}

/**
 * Prepares the database: connects, applies the schema, seeds demo data on an
 * empty database. Safe to call on every boot (schema is IF NOT EXISTS).
 */
export async function initDatabase() {
  if (DB_ENGINE === 'postgres') {
    const { createPostgresDriver } = await import('./drivers/postgres.js');
    driver = createPostgresDriver({
      connectionString: process.env.DATABASE_URL,
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'onepromag',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'onepromag',
      max: Number(process.env.PGPOOL_MAX || 10),
    });
    await db.waitUntilReady();
    await db.exec(readSchema('postgres'));
    await migratePostgres();
    await migrateDocumentsKey();
    await createIndexes();
  } else {
    const { createSqliteDriver } = await import('./drivers/sqlite.js');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    driver = createSqliteDriver(path.join(DATA_DIR, 'app.db'));
    // SQLite schema includes PRAGMA statements, so exec the file verbatim.
    await db.exec(readSchema('sqlite'));
    await migrateSqlite();
    await migrateDocumentsKey();
    await createIndexes();
  }
  await pruneOrphanNotes();
  await recordSchemaVersion();
  // Properties before the demo seed: the seeded projects carry category/status keys
  // that must already mean something.
  const properties = await seedPropertiesIfEmpty();
  const result = SEED_DEMO ? await seed() : await seedBootstrapAdmin();
  // Runs after seed() on purpose: a brand-new database gets its devices from
  // seed() itself, and only an EXISTING install needs the backfill. With demo
  // data off there is nothing to backfill into either.
  const devices = SEED_DEMO ? await seedDevicesIfEmpty() : { seeded: false };
  return { engine: db.engine, ...result, devices, properties, demo: SEED_DEMO };
}

/**
 * Adds columns to databases created by an older release. Both engines are
 * idempotent: the column is only added when missing.
 */
/**
 * Widens `documents`' primary key from (scope, scope_id) to
 * (scope, scope_id, env).
 *
 * `CREATE TABLE IF NOT EXISTS` in the schema file cannot alter a table that
 * already exists, so an install created before per-environment sheets would keep
 * the old key: every write to the Prod sheet would collide with the Dev row on
 * (scope, scope_id) and there would be nowhere to put it. The table is rebuilt
 * once, guarded by a check on the current key columns, and the existing rows are
 * carried over as Dev.
 */
async function migrateDocumentsKey() {
  if (db.engine === 'postgres') {
    const pk = await db.get(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'documents' AND c.contype = 'p'`
    );
    if (!pk || /env/.test(pk.def || '')) return;
    await db.exec("ALTER TABLE documents ADD COLUMN IF NOT EXISTS env TEXT NOT NULL DEFAULT 'Dev'");
    await db.exec('ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_pkey');
    await db.exec('ALTER TABLE documents ADD PRIMARY KEY (scope, scope_id, env)');
    return;
  }
  const info = await db.all('PRAGMA table_info(documents)');
  if (!info.length) return;
  // `pk` is 1-based position within the primary key, 0 when the column is not part
  // of it — so env must be 0 in the old table and non-zero in the new one.
  const envCol = info.find((c) => c.name === 'env');
  if (envCol && Number(envCol.pk) > 0) return;
  // One transaction, and a recovery step for a previous interrupted run.
  //
  // This is the only migration that rewrites data, and it used to run without
  // BEGIN/COMMIT. A crash (or a full volume) between the rename and the drop left
  // `documents_old` holding every sheet and no `documents` table — and the next
  // boot died on `table documents_old already exists`, which with
  // `restart: unless-stopped` is a permanently bricked install. SQLite DDL is
  // transactional, so this either happens completely or not at all.
  await db.exec('PRAGMA foreign_keys = OFF');
  try {
    await db.exec('BEGIN IMMEDIATE');
    // Left behind by an older, interrupted run: its contents are already the
    // authority only if `documents` is missing, which the table_info check above
    // would have caught. Safe to drop.
    await db.exec('DROP TABLE IF EXISTS documents_old');
    await db.exec('ALTER TABLE documents RENAME TO documents_old');
    await db.exec(`CREATE TABLE documents (
      scope      TEXT NOT NULL,
      scope_id   INTEGER NOT NULL,
      env        TEXT NOT NULL DEFAULT 'Dev',
      text_body  TEXT NOT NULL DEFAULT '',
      table_json TEXT NOT NULL DEFAULT '',
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (scope, scope_id, env)
    )`);
    // Old rows had no environment, so they are Dev: that is where a tester starts
    // and where every sheet written before this release came from.
    await db.exec(`INSERT INTO documents (scope, scope_id, env, text_body, table_json, updated_by, updated_at)
      SELECT scope, scope_id, 'Dev', text_body, table_json, updated_by, updated_at FROM documents_old`);
    await db.exec('DROP TABLE documents_old');
    await db.exec('COMMIT');
  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch {
      /* the statement may have aborted the transaction already */
    }
    throw err;
  } finally {
    await db.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * Columns a failed ALTER would have added. Collected instead of logged-and-forgot:
 * half a schema is worse than none, because the app then starts, answers
 * /healthz with `{ok:true}` (that probe only runs SELECT 1) and returns 500 on
 * every page that names the missing column. Boot fails loudly instead, and
 * `restart: unless-stopped` retries the container.
 */
const failedMigrations = [];

async function addColumnIfMissing(table, column, definition) {
  try {
    if (db.engine === 'postgres') {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
    } else {
      const info = await db.all(`PRAGMA table_info(${table})`);
      if (!info.some((c) => c.name === column)) {
        await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }
  } catch (err) {
    console.error(`[db] migration ${table}.${column} failed:`, err.message);
    failedMigrations.push(`${table}.${column}: ${err.message}`);
  }
}

/**
 * Creates the indexes. This runs AFTER migrations on purpose: `idx_projects_client`
 * references `projects.client_id`, a column that databases created by an older
 * release only gain during migration. Creating it inside the schema file made the
 * whole multi-statement schema transaction abort on those databases.
 * Every statement is individually guarded so one failure cannot cascade.
 */
/**
 * Deletes notes whose client or application no longer exists.
 * Older releases deleted the parent without cleaning up, leaving notes that no
 * page can reach and no user can delete. Runs once per boot; the two statements
 * are cheap and idempotent.
 */
async function pruneOrphanNotes() {
  try {
    await db.run(
      "DELETE FROM info_entries WHERE scope = 'client' AND scope_id NOT IN (SELECT id FROM clients)"
    );
    await db.run(
      "DELETE FROM info_entries WHERE scope = 'application' AND scope_id NOT IN (SELECT id FROM applications)"
    );
  } catch (err) {
    // A missing info_entries table on a very old database is not fatal.
    if (!/no such table|does not exist/i.test(err.message)) throw err;
  }
}

async function createIndexes() {
  const statements = [
    'CREATE INDEX IF NOT EXISTS idx_retests_project ON retests(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)',
    'CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_applications_client ON applications(client_id)',
    'CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(manager_id)',
    'CREATE INDEX IF NOT EXISTS idx_client_managers_user ON client_managers(user_id)',
    // One lookup per page render: "every note for THIS client or application".
    'CREATE INDEX IF NOT EXISTS idx_info_scope ON info_entries(scope, scope_id)',
    'CREATE INDEX IF NOT EXISTS idx_info_env ON info_entries(scope, scope_id, env)',
    // Retest codes are RT-<project>-<seq>; uniqueness stops a concurrent insert
    // from minting a duplicate. Legacy rows may already collide, hence the guard.
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_retests_code ON retests(project_id, code)',
    // The device page filters by kind (four tabs), so kind leads the index.
    'CREATE INDEX IF NOT EXISTS idx_devices_kind ON devices(kind)',
    // Column config is read once per kind on every page load.
    'CREATE INDEX IF NOT EXISTS idx_device_columns_kind ON device_columns(kind)',
    // Login accepts a username OR an email, so the email lookup must not scan the
    // user table. Not UNIQUE: existing rows may share '' and duplicates are only
    // rejected where they would make a login ambiguous (see auth.findUserByLogin).
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
  ];
  for (const sql of statements) {
    try {
      await db.exec(sql);
    } catch (err) {
      console.error('[db] index skipped:', sql.replace(/^CREATE (UNIQUE )?INDEX IF NOT EXISTS /, ''), '-', err.message);
    }
  }
}

async function migrateSqlite() {
  // v1.1 -> v1.2: Client field became a real table; projects gained references.
  await addColumnIfMissing('projects', 'client', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('users', 'subrole', "TEXT NOT NULL DEFAULT 'Member'");
  await addColumnIfMissing('projects', 'client_id', 'INTEGER REFERENCES clients(id) ON DELETE SET NULL');
  await addColumnIfMissing(
    'projects',
    'application_id',
    'INTEGER REFERENCES applications(id) ON DELETE SET NULL'
  );
  await addColumnIfMissing('projects', 'platform', "TEXT NOT NULL DEFAULT ''");
  // v1.3: pentester hierarchy tree (Lead > Sub Lead > Member).
  await addColumnIfMissing('users', 'parent_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
  // v1.4: start/end dates. Both are nullable and are set automatically when a
  // project moves to Ongoing (start) or Done (end); they stay editable after that.
  await addColumnIfMissing('projects', 'started_at', 'TEXT NOT NULL DEFAULT \'\'');
  await addColumnIfMissing('projects', 'ended_at', 'TEXT NOT NULL DEFAULT \'\'');
  await addColumnIfMissing('retests', 'started_at', 'TEXT');
  await addColumnIfMissing('retests', 'ended_at', 'TEXT');
  // v1.5: availability board (status + note on the user row, empty = automatic).
  await addColumnIfMissing('users', 'availability', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('users', 'availability_note', "TEXT NOT NULL DEFAULT ''");
  // v1.6: contact details on every user, one PM per project, several default
  // PMs per client (the join table is created by the schema itself, so only
  // columns need migrating here).
  await addColumnIfMissing('users', 'phone', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('users', 'email', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(
    'projects',
    'manager_id',
    'INTEGER REFERENCES users(id) ON DELETE SET NULL'
  );
  // v1.7: table notes. `kind` says which of body/data carries the content, and
  // `data` holds the JSON grid for kind='table'.
  await addColumnIfMissing('info_entries', 'kind', "TEXT NOT NULL DEFAULT 'text'");
  await addColumnIfMissing('info_entries', 'data', "TEXT NOT NULL DEFAULT ''");
  // v1.11: a note belongs to the sheet it was written on. Defaulting to 'Dev'
  // puts every pre-existing note back exactly where it used to be shown.
  await addColumnIfMissing('info_entries', 'env', "TEXT NOT NULL DEFAULT 'Dev'");
  // v1.8: device inventory. The table itself is created by the schema; only the
  // indexes are shared, so nothing to add here.
  // v1.9: drag-ordering and user-defined columns on the inventory.
  await addColumnIfMissing('devices', 'position', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('devices', 'extra', "TEXT NOT NULL DEFAULT '{}'");
  // v1.10: per-environment documents. Existing rows predate the split, so they
  // belong to Dev — that is where a tester starts and the sheets were written.
  // The primary key is widened by migrateDocumentsKey() below, which runs only on
  // databases created before this column existed.
  await addColumnIfMissing('documents', 'env', "TEXT NOT NULL DEFAULT 'Dev'");
}

async function migratePostgres() {
  // IF NOT EXISTS makes these no-ops on a freshly created schema.
  await addColumnIfMissing('users', 'subrole', "TEXT NOT NULL DEFAULT 'Member'");
  await addColumnIfMissing('projects', 'client_id', 'INTEGER REFERENCES clients(id) ON DELETE SET NULL');
  await addColumnIfMissing(
    'projects',
    'application_id',
    'INTEGER REFERENCES applications(id) ON DELETE SET NULL'
  );
  await addColumnIfMissing('projects', 'platform', "TEXT NOT NULL DEFAULT ''");
  // v1.3: pentester hierarchy tree (Lead > Sub Lead > Member).
  await addColumnIfMissing('users', 'parent_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
  // v1.4: start/end dates. Both are nullable and are set automatically when a
  // project moves to Ongoing (start) or Done (end); they stay editable after that.
  await addColumnIfMissing('projects', 'started_at', 'TEXT NOT NULL DEFAULT \'\'');
  await addColumnIfMissing('projects', 'ended_at', 'TEXT NOT NULL DEFAULT \'\'');
  await addColumnIfMissing('retests', 'started_at', 'TEXT');
  await addColumnIfMissing('retests', 'ended_at', 'TEXT');
  // v1.5: availability board (status + note on the user row, empty = automatic).
  await addColumnIfMissing('users', 'availability', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('users', 'availability_note', "TEXT NOT NULL DEFAULT ''");
  // v1.6: contact details on every user, one PM per project, several default
  // PMs per client.
  await addColumnIfMissing('users', 'phone', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('users', 'email', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(
    'projects',
    'manager_id',
    'INTEGER REFERENCES users(id) ON DELETE SET NULL'
  );
  // v1.7: table notes.
  await addColumnIfMissing('info_entries', 'kind', "TEXT NOT NULL DEFAULT 'text'");
  await addColumnIfMissing('info_entries', 'data', "TEXT NOT NULL DEFAULT ''");
  // v1.11: a note belongs to the sheet it was written on. Defaulting to 'Dev'
  // puts every pre-existing note back exactly where it used to be shown.
  await addColumnIfMissing('info_entries', 'env', "TEXT NOT NULL DEFAULT 'Dev'");
  // v1.9: drag-ordering and user-defined inventory columns.
  await addColumnIfMissing('devices', 'position', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('devices', 'extra', "TEXT NOT NULL DEFAULT '{}'");
  // v1.10: per-environment documents (see migrateSqlite above).
  await addColumnIfMissing('documents', 'env', "TEXT NOT NULL DEFAULT 'Dev'");
}

export { seed };
