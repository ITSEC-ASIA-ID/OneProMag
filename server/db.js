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
  // A Project Manager (PM) is its own account type: PMs own engagements and are
  // assignable as a project's supervisor (SV), but they are not pentesters and
  // never appear in the "who pentest" picker. A pentester may own an engagement
  // too — the SV field accepts both.
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
// them, so they have no place in the (subrole) tree — a PM reports to nobody in it.
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

// [name, shortName, notes, applications[], defaultProjectSupervisors[]]
// The supervisor usernames are resolved after users are inserted, so a client can
// name its usual SVs here and the project form pre-selects them.
/**
 * Variant apps (Client → Application → Variant) for the demo data, keyed by
 * "client||application". Only two applications have them: most do not, and the
 * seed should look like a team that splits an app only when it really ships in
 * several builds.
 */
const SEED_VARIANTS = {
  // A sub app is a separate product under the same application: Brilink is one app
  // with three things worth testing apart from each other.
  'Bank Nusantara||Brilink': ['Brilink MPOS', 'Brilink Mobile', 'Brilink Web'],
  'Bank Nusantara||Brimo': ['Brimo Mobile', 'Brimo Web'],
  'Dompet Kita||Dompet Kita App': ['Dompet Kita Personal', 'Dompet Kita Partner'],
};

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
    notes: 'Default supervisor password still set on the staging unit.',
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
      supervisor: 'rina',
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
      supervisor: 'hendra',
      application: 'Brimo',
      variant: 'Brimo Mobile',
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
      supervisor: 'hendra',
      application: 'Brimo',
      variant: 'Brimo Mobile',
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
      supervisor: 'hendra',
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
      supervisor: 'rina',
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
      supervisor: 'hendra',
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
      supervisor: 'rina',
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
 * must be known in advance (provisioning, a password supervisor, a script).
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
/**
 * Where attachment bytes live. On disk rather than in the database on purpose: a
 * 200 MB library of reports must not turn every nightly dump into a 200 MB file
 * kept for fourteen days, and a 15 MB insert must not hold the write lock.
 * The metadata row is the index; this directory is the data.
 */
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

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

    // clients + their applications + their default project supervisors
    const appIdByKey = new Map();
    const variantIdByKey = new Map();
    for (const [name, shortName, notes, apps, supervisors = []] of SEED_CLIENTS) {
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
        const appId = Number(appRow.id);
        appIdByKey.set(`${name}||${appName}`, appId);
        for (const variantName of SEED_VARIANTS[`${name}||${appName}`] || []) {
          const variantRow = await tx.get(
            `INSERT INTO application_variants (application_id, name, notes, created_at)
             VALUES (?, ?, ?, ?) RETURNING id`,
            [appId, variantName, '', now()]
          );
          variantIdByKey.set(`${name}||${appName}||${variantName}`, Number(variantRow.id));
        }
      }
      for (const username of supervisors) {
        const supervisorId = idByUsername.get(username);
        if (supervisorId) {
          await tx.run('INSERT INTO client_supervisors (client_id, user_id) VALUES (?, ?)', [
            clientId,
            supervisorId,
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
      const variantId = p.variant
        ? variantIdByKey.get(`${p.client}||${p.application}||${p.variant}`) ?? null
        : null;

      const inserted = await tx.get(
        `INSERT INTO projects (name, client, client_id, application_id, variant_id, supervisor_id, category, platform, env, method, status, notes, created_by, created_at, updated_at, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
          p.name,
          p.client,
          clientId,
          applicationId,
          variantId,
          p.supervisor ? idByUsername.get(p.supervisor) ?? null : null,
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
            '  destructive test in writing. Ask the SV before anything that writes.',
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
 * The checklists every install starts with, so a fresh engagement has something
 * to attach instead of an empty picker.
 *
 * `key` is the identity, not the name. A shipped template keeps its row — and so
 * keeps every project already pointing at it — while its name and its questions
 * change. `version` moves when a standard is republished, which is what a
 * security checklist does: it is superseded, never edited. Only then are the
 * items regenerated, and the answers recorded against the replaced ones go with
 * them, because keeping the 2021 questions alive beside the 2025 ones is worse
 * than losing a few ticks.
 *
 * `category` matches `projects.category` (`Web`, `Mobile`, `API`, `EDC`);
 * `isDefault` is what a project gets attached to on its own when its category is
 * chosen. `''` means "fits any category".
 *
 * Afterwards these are ordinary rows: editable, extendable, deletable once no
 * project uses them. `seed_key = ''` marks a template an admin made, and the
 * sync never touches one of those.
 */
const DEFAULT_CHECKLISTS = [
  {
    key: 'owasp-web',
    version: 1,
    name: 'OWASP Top 10:2025',
    description:
      'The ten web application risk categories as published for 2025, two testable checks each.',
    category: 'Web',
    isDefault: true,
    items: [
      [
        'A01:2025 — Broken Access Control',
        'Change an object id in a request to one that belongs to another account.',
        'Ownership is checked server-side on every id-taking endpoint, not just a valid session.',
      ],
      [
        'A01:2025 — Broken Access Control',
        'Call an admin-only action as a member, and a member-only one as a guest.',
        'The server answers 403; the refusal is not a hidden button.',
      ],
      [
        'A02:2025 — Security Misconfiguration',
        'Read the headers, the error pages, the default accounts and the directory listing.',
        'No debug mode, no stack trace, no default credentials, no directory listing.',
      ],
      [
        'A02:2025 — Security Misconfiguration',
        'Ask for a path the router does not own: /.git/config, /.env, /backup.sql, /phpinfo.php.',
        '404 with no body; deploy artefacts are not in the image.',
      ],
      [
        'A03:2025 — Software Supply Chain Failures',
        'List every dependency and base image, then match the versions against advisories.',
        'Nothing with a known critical advisory in the build; audit output triaged, not ignored.',
      ],
      [
        'A03:2025 — Software Supply Chain Failures',
        'Follow one package from manifest to running process: registry, lockfile, build step.',
        'Lockfile committed and verified, image pulled by digest, no build from an unpinned branch.',
      ],
      [
        'A04:2025 — Cryptographic Failures',
        'Look for plaintext secrets in traffic, storage, logs and URLs.',
        'Passwords behind a real KDF; nothing sensitive in a URL or in localStorage.',
      ],
      [
        'A04:2025 — Cryptographic Failures',
        'Scan TLS: protocols, ciphers, chain, and whether plain HTTP redirects.',
        'TLS 1.2+, no RC4/3DES/export ciphers, valid chain, HSTS on the apex.',
      ],
      [
        'A05:2025 — Injection',
        'Send quotes, unions and template syntax to every input that reaches a query, a shell or a template.',
        'Parameterised queries; no string concatenation into SQL, shell or HTML.',
      ],
      [
        'A05:2025 — Injection',
        'Use a filename, an upload and a header as the injection carrier.',
        'Filenames are stored as data; headers never reach a shell command.',
      ],
      [
        'A06:2025 — Insecure Design',
        'Skip a step the flow assumes: reorder it, replay it, jump straight to the last screen.',
        'Business rules enforced server-side, not by the order of the screens.',
      ],
      [
        'A06:2025 — Insecure Design',
        'Ask what the feature allows at ten times the intended rate.',
        'Quotas and limits designed in, not bolted on after the abuse.',
      ],
      [
        'A07:2025 — Authentication Failures',
        'Attack the login: weak passwords, no lockout, session fixation, a token that survives logout.',
        'Sessions invalidated on logout and password change; brute force slowed or blocked.',
      ],
      [
        'A07:2025 — Authentication Failures',
        'Walk the password reset and the MFA flows looking for a way around them.',
        'Reset tokens single-use and short-lived; MFA cannot be skipped by replaying a request.',
      ],
      [
        'A08:2025 — Software or Data Integrity Failures',
        'Check what the app trusts without verifying: updates, deserialisation, third-party scripts.',
        'No unsigned update path, no unsafe deserialisation of user input.',
      ],
      [
        'A08:2025 — Software or Data Integrity Failures',
        'Poison something the app loads: a cache entry, a CDN file, a package.',
        'Subresource integrity or a pinned vendor copy; cache keys not attacker-chosen.',
      ],
      [
        'A09:2025 — Security Logging and Alerting Failures',
        'Do something hostile, then ask whether anyone could ever find out it happened.',
        'Auth failures and privilege changes logged without secrets, and retained.',
      ],
      [
        'A09:2025 — Security Logging and Alerting Failures',
        'Check the alarm, not just the log: is anything watching?',
        'A burst of failed logins raises an alert a person actually reads.',
      ],
      [
        'A10:2025 — Mishandling of Exceptional Conditions',
        'Feed malformed input to every parser: JSON, dates, numbers, odd encodings.',
        'Errors handled per request; one bad request cannot fail the others.',
      ],
      [
        'A10:2025 — Mishandling of Exceptional Conditions',
        'Run out of something: disk, memory, connections, a dependency that times out.',
        'Fails closed with a clear error, no crash loop, no half-written state.',
      ],
    ],
  },
  {
    key: 'owasp-api',
    version: 1,
    name: 'OWASP API Security Top 10 2023',
    description: 'The 2023 API risk categories, one testable check each.',
    category: 'API',
    isDefault: true,
    items: [
      ['API1:2023 — Broken Object Level Authorization', 'Change an object id in every endpoint that takes one, including nested and bulk routes.', 'Ownership checked per object, not per session and not per route.'],
      ['API2:2023 — Broken Authentication', 'Take the token apart: where it is stored, how long it lives, whether logout kills it.', 'Short-lived tokens, rotation on login, server-side invalidation on logout.'],
      ['API3:2023 — Broken Object Property Level Authorization', 'Compare the response body to what the screen needs, then send fields that should be read-only.', 'No extra fields in the response; the server ignores fields a client must not set.'],
      ['API4:2023 — Unrestricted Resource Consumption', 'Ask for a million rows, an absurd page size, and an upload with no cap.', 'Pagination, size caps and rate limits enforced server-side.'],
      ['API5:2023 — Broken Function Level Authorization', 'Call an admin endpoint with a member token, and a member endpoint as a guest.', 'Every route checks the role it needs; the 403 comes from the server.'],
      ['API6:2023 — Unrestricted Access to Sensitive Business Flows', 'Replay a purchase, a ticket claim or a coupon — in parallel, and very fast.', 'Idempotency keys and per-account limits; automation cannot exceed a human.'],
      ['API7:2023 — Server Side Request Forgery', 'Point every URL or webhook parameter at 169.254.169.254 and at localhost.', 'Outbound fetch allow-listed; internal ranges refused; the response is not echoed back.'],
      ['API8:2023 — Security Misconfiguration', 'Read the headers, the CORS policy, the error bodies and the docs endpoint.', 'No wildcard CORS with credentials, no stack trace, no open documentation endpoint.'],
      ['API9:2023 — Improper Inventory Management', 'Find versions and hosts nobody documented: /v1, /beta, /internal, staging.', 'Every deployed version inventoried, deprecated ones switched off, not merely undocumented.'],
      ['API10:2023 — Unsafe Consumption of APIs', 'Feed a third-party response you control: a redirect, a huge body, a TLS downgrade.', 'Third-party data validated like user input; timeouts and size limits on the call.'],
    ],
  },
  {
    key: 'web-hardening',
    version: 1,
    name: 'Web hardening basics',
    description: 'The checks that are always the same, on every engagement.',
    category: 'Web',
    isDefault: false,
    items: [
      ['Security headers', 'Read the response headers of the landing page and an API call.', 'CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors.'],
      ['TLS configuration', 'Run a protocol and cipher scan against the host.', 'TLS 1.2+, no RC4/3DES/export ciphers, valid chain, HSTS on the apex.'],
      ['Cookies and sessions', 'Read Set-Cookie on login and try to reuse a token after logout.', 'HttpOnly, Secure, SameSite; session id rotated on login and killed on logout.'],
      ['Error handling', 'Trigger a 500 and a malformed request.', 'Generic message to the user, detail to the log only; no stack trace or SQL in the response.'],
      ['File uploads', 'Upload an .html, an .svg and a name with ../ in it.', 'Type and size checked server-side, stored outside the web root, served as a download.'],
      ['Rate limiting', 'Hammer the login and the search endpoint for a minute.', 'Throttled or delayed, with a 429 or a growing delay rather than silence.'],
      ['Sensitive data in logs', 'Grep the application log for a password, a token and a PAN.', 'No secrets, no full card numbers, no session ids in any log line.'],
      ['CORS', 'Send an Origin from an untrusted site against the API.', 'No wildcard with credentials; only the origins actually needed are allowed.'],
      ['Exposed files', 'Request /.git/config, /.env, /backup.sql, /phpinfo.php.', 'None reachable; deploy artefacts excluded from the image.'],
      ['Backup and restore', 'Confirm a backup exists, then read what it contains.', 'Backups taken on schedule, stored off the host, and a restore has been rehearsed.'],
    ],
  },
];

/** Ship-then-withdraw: a template we no longer publish, dropped on boot. */
const RETIRED_CHECKLISTS = ['OWASP Top 10 2021'];

/**
 * Seeds the shipped templates and keeps them current.
 *
 * Idempotent, and safe to kill halfway: the row is written before its items, so
 * the next boot sees the version it has not reached yet and finishes the job
 * instead of inserting a second copy.
 */
async function syncSeededChecklists() {
  const stamp = now();
  const live = DEFAULT_CHECKLISTS.map((template) => template.key);
  let written = 0;
  let retired = 0;

  for (const template of DEFAULT_CHECKLISTS) {
    let row = await db.get('SELECT id, seed_version FROM checklists WHERE seed_key = ?', [
      template.key,
    ]);
    if (!row) {
      // An install seeded before `seed_key` existed carries the same template
      // under its name, with no key: adopt it rather than adding a duplicate.
      const legacy = await db.get(
        "SELECT id, seed_version FROM checklists WHERE name = ? AND seed_key = ''",
        [template.name]
      );
      if (legacy) {
        await db.run('UPDATE checklists SET seed_key = ? WHERE id = ?', [template.key, legacy.id]);
        row = legacy;
      }
    }

    if (!row) {
      const inserted = await db.run(
        `INSERT INTO checklists (name, description, category, is_default, seed_key, seed_version, created_at)
         VALUES (?, ?, ?, ${template.isDefault ? 'TRUE' : 'FALSE'}, ?, ?, ?) RETURNING id`,
        [template.name, template.description, template.category, template.key, template.version, stamp]
      );
      await writeChecklistItems(db, inserted.lastInsertId, template.items);
      written += 1;
      continue;
    }

    await db.run(
      `UPDATE checklists
          SET name = ?, description = ?, category = ?, is_default = ${template.isDefault ? 'TRUE' : 'FALSE'}
        WHERE id = ?`,
      [template.name, template.description, template.category, row.id]
    );
    if (Number(row.seed_version || 0) >= template.version) continue;

    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM checklist_items WHERE checklist_id = ?', [row.id]);
      await writeChecklistItems(tx, row.id, template.items);
      await tx.run('UPDATE checklists SET seed_version = ? WHERE id = ?', [
        template.version,
        row.id,
      ]);
    });
    written += 1;
  }

  // Our own superseded templates, plus anything renamed away from a published
  // name before `seed_key` existed. A project still pointing at one is detached
  // first: `ON DELETE RESTRICT` would otherwise stop the boot.
  for (const name of RETIRED_CHECKLISTS) {
    const stale = await db.all("SELECT id FROM checklists WHERE name = ? AND seed_key = ''", [name]);
    for (const { id } of stale) {
      await db.transaction(async (tx) => {
        await tx.run('DELETE FROM project_checklists WHERE checklist_id = ?', [id]);
        await tx.run('DELETE FROM checklists WHERE id = ?', [id]);
      });
      retired += 1;
    }
  }
  const shipped = await db.all("SELECT id, seed_key FROM checklists WHERE seed_key <> ''");
  for (const row of shipped) {
    if (live.includes(row.seed_key)) continue;
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM project_checklists WHERE checklist_id = ?', [row.id]);
      await tx.run('DELETE FROM checklists WHERE id = ?', [row.id]);
    });
    retired += 1;
  }

  return { seeded: written > 0, checklists: written, retired };
}

async function writeChecklistItems(conn, checklistId, items) {
  for (let i = 0; i < items.length; i += 1) {
    const [section, title, help] = items[i];
    await conn.run(
      'INSERT INTO checklist_items (checklist_id, section, title, help, position) VALUES (?, ?, ?, ?, ?)',
      [checklistId, section, title, help, i]
    );
  }
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
 * 19 — project attachments and security checklists.
 * 20 — checklist categories, one default per category, versioned seed.
 * 21 — one checklist per project: a unique index on project_checklists(project_id).
 * 22 — working notes per project, read newest-first as a timeline.
 */
export const SCHEMA_VERSION = 22;

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
    await migrateSupervisorNames();
    await dedupeProjectChecklists();
    await createIndexes();
  } else {
    const { createSqliteDriver } = await import('./drivers/sqlite.js');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    driver = createSqliteDriver(path.join(DATA_DIR, 'app.db'));
    // SQLite schema includes PRAGMA statements, so exec the file verbatim.
    await db.exec(readSchema('sqlite'));
    await migrateSqlite();
    await migrateDocumentsKey();
    await migrateSupervisorNames();
    await dedupeProjectChecklists();
    await createIndexes();
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  await pruneOrphanNotes();
  await recordSchemaVersion();
  // Properties before the demo seed: the seeded projects carry category/status keys
  // that must already mean something.
  const properties = await seedPropertiesIfEmpty();
  const checklists = await syncSeededChecklists();
  const result = SEED_DEMO ? await seed() : await seedBootstrapAdmin();
  // Runs after seed() on purpose: a brand-new database gets its devices from
  // seed() itself, and only an EXISTING install needs the backfill. With demo
  // data off there is nothing to backfill into either.
  const devices = SEED_DEMO ? await seedDevicesIfEmpty() : { seeded: false };
  return { engine: db.engine, ...result, devices, properties, checklists, demo: SEED_DEMO };
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

/** Does this table exist? Both engines, without relying on dialect-specific casts. */
async function tableExists(name) {
  if (db.engine === 'postgres') {
    const row = await db.get(
      'SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?',
      [name]
    );
    return Boolean(row);
  }
  const row = await db.get("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?", [
    name,
  ]);
  return Boolean(row);
}

async function columnExists(table, column) {
  if (db.engine === 'postgres') {
    const row = await db.get(
      'SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?',
      [table, column]
    );
    return Boolean(row);
  }
  const info = await db.all(`PRAGMA table_info(${table})`);
  return info.some((c) => c.name === column);
}

/**
 * v28: the "Project Manager" role became "Supervisor" (short SV).
 *
 * A rename that only touched the labels would leave the schema lying: the table
 * would still be `client_managers` and the column `manager_id` while every screen,
 * endpoint and test says supervisor. So the data moves too — guarded, because an
 * install created after this release already has the new names and must not be
 * renamed twice.
 *
 * The stale index names are dropped rather than renamed: createIndexes() runs
 * immediately after this and builds the new ones, so there is one statement that
 * knows each index instead of two that must agree.
 */
async function migrateSupervisorNames() {
  try {
    /* --- client default supervisors ------------------------------------- */
    if (await tableExists('client_managers')) {
      if (!(await tableExists('client_supervisors'))) {
        await db.exec('DROP INDEX IF EXISTS idx_client_managers_user');
        await db.exec('ALTER TABLE client_managers RENAME TO client_supervisors');
      } else {
        // `CREATE TABLE IF NOT EXISTS` in the schema file runs BEFORE this
        // migration, so a legacy database arrives with an EMPTY
        // client_supervisors next to the populated client_managers. Carry the rows
        // across rather than renaming — that is what the schema left us with.
        await db.exec(`INSERT INTO client_supervisors (client_id, user_id)
          SELECT cm.client_id, cm.user_id FROM client_managers cm
           WHERE NOT EXISTS (
                   SELECT 1 FROM client_supervisors cs
                    WHERE cs.client_id = cm.client_id AND cs.user_id = cm.user_id)`) ;
        await db.exec('DROP TABLE client_managers');
      }
      await db.exec('DROP INDEX IF EXISTS idx_client_managers_user');
    }

    /* --- projects.manager_id -> supervisor_id --------------------------- */
    const hasOld = await columnExists('projects', 'manager_id');
    const hasNew = await columnExists('projects', 'supervisor_id');
    if (hasOld && !hasNew) {
      await db.exec('DROP INDEX IF EXISTS idx_projects_manager');
      await db.exec('ALTER TABLE projects RENAME COLUMN manager_id TO supervisor_id');
    } else if (hasOld && hasNew) {
      // Same story as the table: the migration that used to add `manager_id`
      // now adds `supervisor_id`, so both exist and the values are in the old one.
      await db.exec(
        'UPDATE projects SET supervisor_id = manager_id WHERE supervisor_id IS NULL AND manager_id IS NOT NULL'
      );
      await db.exec('ALTER TABLE projects DROP COLUMN manager_id');
      await db.exec('DROP INDEX IF EXISTS idx_projects_manager');
    }

    // The ROLE was never renamed: "Project Manager" is still the account type, it
    // is only the project's owner field that is called Supervisor. A database that
    // booted on the intermediate release stored the wrong value, so put it back.
    // Idempotent: after one boot nothing matches.
    await db.run("UPDATE users SET role = 'Project Manager' WHERE role = 'Supervisor'");
  } catch (err) {
    console.error('[db] supervisor rename failed:', err.message);
    failedMigrations.push(`supervisor rename: ${err.message}`);
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

/** The undo of addColumnIfMissing: used when a column shipped and was then dropped. */
async function dropColumnIfExists(table, column) {
  if (!(await columnExists(table, column))) return;
  try {
    await db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  } catch (err) {
    // SQLite before 3.35 cannot drop a column. Leaving it is harmless: every
    // statement in the code names its columns explicitly.
    console.warn(`[db] could not drop ${table}.${column}:`, err.message);
  }
}

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
/**
 * Notes and sheets whose target no longer exists.
 *
 * The delete routes purge their own children, but nothing else does: a row written
 * by an older release, or a target removed by hand in psql, would keep a note on a
 * page nobody can open. This is the belt to that braces, run once per boot.
 */
const INFO_SCOPE_TABLES = [
  ['client', 'clients'],
  ['application', 'applications'],
  ['variant', 'application_variants'],
];

async function pruneOrphanNotes() {
  for (const table of ['info_entries', 'documents']) {
    for (const [scope, owner] of INFO_SCOPE_TABLES) {
      try {
        await db.run(
          `DELETE FROM ${table} WHERE scope = ? AND scope_id NOT IN (SELECT id FROM ${owner})`,
          [scope]
        );
      } catch (err) {
        // A very old database may not have one of these tables yet. That is not
        // fatal — the next release's schema pass creates them.
        if (!/no such table|does not exist/i.test(err.message)) throw err;
      }
    }
  }
}

/**
 * A project carries ONE checklist. The table started as many-per-project, so a
 * database that predates the rule can hold duplicates: keep the newest link and
 * drop the rest (their answers go with them), then the unique index below can be
 * created. Runs before createIndexes(), which would otherwise fail.
 */
async function dedupeProjectChecklists() {
  const dupes = await db.all(
    `SELECT id FROM project_checklists pc
      WHERE EXISTS (
        SELECT 1 FROM project_checklists newer
         WHERE newer.project_id = pc.project_id
           AND (newer.created_at > pc.created_at
                OR (newer.created_at = pc.created_at AND newer.id > pc.id))
      )`
  );
  if (!dupes.length) return 0;
  const ids = dupes.map((row) => row.id);
  await db.run(`DELETE FROM project_checklist_items WHERE project_checklist_id IN (${ids.map(() => '?').join(',')})`, ids);
  await db.run(`DELETE FROM project_checklists WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  console.warn(`[db] kept the newest checklist for ${ids.length} project(s); the rest were removed`);
  return ids.length;
}

async function createIndexes() {
  const statements = [
    'CREATE INDEX IF NOT EXISTS idx_retests_project ON retests(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)',
    'CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_applications_client ON applications(client_id)',
    // Variants are read per application on every page that lists applications.
    'CREATE INDEX IF NOT EXISTS idx_variants_application ON application_variants(application_id)',
    'CREATE INDEX IF NOT EXISTS idx_projects_supervisor ON projects(supervisor_id)',
    'CREATE INDEX IF NOT EXISTS idx_client_supervisors_user ON client_supervisors(user_id)',
    // One lookup per page render: "every note for THIS client or application".
    'CREATE INDEX IF NOT EXISTS idx_info_scope ON info_entries(scope, scope_id)',
    'CREATE INDEX IF NOT EXISTS idx_info_env ON info_entries(scope, scope_id, env)',
    // The primary key of project_pentesters is (project_id, user_id), which cannot
    // answer "which projects is this person on" — the My projects filter — because
    // user_id is the second column of the key, not its prefix.
    'CREATE INDEX IF NOT EXISTS idx_project_pentesters_user ON project_pentesters(user_id)',
    // Every open-retest test is `project_id = ? AND status <> 'Done'`. The existing
    // project_id index narrows to the project and then filters; leading with status
    // as well lets the engine read only the open rows.
    'CREATE INDEX IF NOT EXISTS idx_retests_project_status ON retests(project_id, status)',
    // Nothing filters on expires_at today, so this index earns its place only
    // because expireSessions() sweeps by it — on boot and hourly.
    'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)',
    // Retest codes are RT-<project>-<seq>; uniqueness stops a concurrent insert
    // from minting a duplicate. Legacy rows may already collide, hence the guard.
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_retests_code ON retests(project_id, code)',
    // Attachments are listed newest-first for one project on every drawer open.
    'CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id, created_at DESC)',
    // One checklist per project, enforced by the engine rather than by every
    // route remembering to check. dedupeProjectChecklists() clears the way.
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_project_checklists_one ON project_checklists(project_id)',
    // A checklist is rendered section by section, in stored order.
    'CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist ON checklist_items(checklist_id, position)',
    // "which projects use this template" gates the delete; "which templates does
    // this project carry" is asked on every drawer open.
    'CREATE INDEX IF NOT EXISTS idx_checklists_category ON checklists(category, is_default)',
    'CREATE INDEX IF NOT EXISTS idx_project_checklists_project ON project_checklists(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_project_checklists_checklist ON project_checklists(checklist_id)',
    // The device page filters by kind (four tabs), so kind leads the index.
    'CREATE INDEX IF NOT EXISTS idx_devices_kind ON devices(kind)',
    // Pentest notes are listed newest-first for one project, which is the only
    // way they are ever read.
    'CREATE INDEX IF NOT EXISTS idx_pentest_notes_project ON project_pentest_notes(project_id, entry_date DESC, id DESC)',
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
  // v30: a sub app is a name. One release briefly gave it platform / identifier /
  // version; a database that ran it is put back to the shape the code reads.
  await dropColumnIfExists('application_variants', 'platform');
  await dropColumnIfExists('application_variants', 'identifier');
  await dropColumnIfExists('application_variants', 'version');
  // v31: who is online, from the last authenticated request.
  await addColumnIfMissing('users', 'last_seen_at', "TEXT NOT NULL DEFAULT ''");
  // v29: an engagement may test one variant of its application (optional).
  await addColumnIfMissing(
    'projects',
    'variant_id',
    'INTEGER REFERENCES application_variants(id) ON DELETE SET NULL'
  );
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
  // v1.6: contact details on every user, one SV per project, several default
  // SVs per client (the join table is created by the schema itself, so only
  // columns need migrating here).
  await addColumnIfMissing('users', 'phone', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('users', 'email', "TEXT NOT NULL DEFAULT ''");

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
  // v1.20: a checklist answers to one project category, one per category can be
  // the default a project is attached to by itself, and a shipped template
  // carries the key and version that let a later boot replace it.
  await addColumnIfMissing('checklists', 'category', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('checklists', 'is_default', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('checklists', 'seed_key', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('checklists', 'seed_version', 'INTEGER NOT NULL DEFAULT 0');
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
  // v30: a sub app is a name. One release briefly gave it platform / identifier /
  // version; a database that ran it is put back to the shape the code reads.
  await dropColumnIfExists('application_variants', 'platform');
  await dropColumnIfExists('application_variants', 'identifier');
  await dropColumnIfExists('application_variants', 'version');
  // v31: who is online, from the last authenticated request.
  await addColumnIfMissing('users', 'last_seen_at', "TEXT NOT NULL DEFAULT ''");
  // v29: an engagement may test one variant of its application (optional).
  await addColumnIfMissing(
    'projects',
    'variant_id',
    'INTEGER REFERENCES application_variants(id) ON DELETE SET NULL'
  );
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
  // v1.6: contact details on every user, one SV per project, several default
  // SVs per client.
  await addColumnIfMissing('users', 'phone', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('users', 'email', "TEXT NOT NULL DEFAULT ''");

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
  // v1.20: checklist category, per-category default and seed identity.
  await addColumnIfMissing('checklists', 'category', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('checklists', 'is_default', 'BOOLEAN NOT NULL DEFAULT false');
  await addColumnIfMissing('checklists', 'seed_key', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('checklists', 'seed_version', 'INTEGER NOT NULL DEFAULT 0');
}

export { seed };
