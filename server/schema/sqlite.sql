-- OneProMag schema — SQLite
-- Timestamps are ISO-8601 TEXT so the same values work in Postgres unchanged.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'Pentester',
  -- Pentester hierarchy: Lead > Sub Lead > Member.
  -- parent_id points at the user directly above this one in the tree.
  subrole       TEXT NOT NULL DEFAULT 'Member',
  parent_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- Availability board. Empty availability means "automatic": the board shows
  -- On Project / Idle from the pentester's real assignments. A manual value
  -- (Leave / Exam / Research-Learning / Other) overrides that until cleared.
  availability      TEXT NOT NULL DEFAULT '',
  availability_note TEXT NOT NULL DEFAULT '',
  -- Contact details. Shown wherever a person is listed so a PM can be reached
  -- without leaving the app. Free text: Indonesian numbers and 
  -- international ones both have to fit, so no format is enforced.
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- A client owns applications. Projects belong to exactly one application.
CREATE TABLE IF NOT EXISTS clients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE NOT NULL,
  short_name TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- Which project managers usually handle a client.
-- Many-to-many: one PM can own several clients, and a client can be covered by
-- more than one PM. The project form pre-selects these when the client is
-- picked, which is the whole point of the table.
CREATE TABLE IF NOT EXISTS client_managers (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, user_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (client_id, name)
);

-- Free-form information library.
-- One row per "note entry". The whole point is that no two applications record
-- the same things, so the body is an untagged Markdown document rather than
-- columns called "credential" and "common_error" — anything with a fixed schema
-- forces every client's habits into the same box.
--
-- scope_id points at a client or at an application depending on scope; the
-- application rows own their content so deleting an app takes its notes with
-- it, while a client row's notes stay with the client.
CREATE TABLE IF NOT EXISTS info_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope      TEXT NOT NULL,                       -- 'client' | 'application'
  scope_id   INTEGER NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT 'General',    -- grouping label, free text
  -- 'text' notes keep their content in `body`. 'table' notes keep a JSON grid in
  -- `data` instead, because a table is edited as rows/columns and re-serialising
  -- it into prose on every render would lose the structure the user typed.
  kind       TEXT NOT NULL DEFAULT 'text',
  data       TEXT NOT NULL DEFAULT '',
  -- 'Dev' | 'Prod' on an application's notes; a client note is always 'Dev'
  -- because a client has no production sheet to sit on.
  env        TEXT NOT NULL DEFAULT 'Dev',
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One free-form document set per target: a plain-text note and a table.
-- Deliberately NOT rows in info_entries: these are fixed singletons that always
-- exist, so they are edited in place instead of being created and named first.
-- `table` holds the same JSON grid shape info_entries.data uses.
CREATE TABLE IF NOT EXISTS documents (
  scope      TEXT NOT NULL,                      -- 'client' | 'application'
  scope_id   INTEGER NOT NULL,
  -- Which environment the sheet describes. Every application carries a Dev and a
  -- Prod copy; clients carry only Dev, because a client is not an environment.
  env        TEXT NOT NULL DEFAULT 'Dev',
  text_body  TEXT NOT NULL DEFAULT '',
  table_json TEXT NOT NULL DEFAULT '',
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (scope, scope_id, env)
);

-- Device inventory: the phones, tablets and EDC terminals the team tests with.
--
-- The columns here are the UNION of the four kinds' fields, not a per-kind table,
-- because the kinds differ only in which fields they carry. DEVICE_FIELDS in
-- db.js is the authority on that split and the API rejects fields a kind does not
-- own — otherwise an Android row could carry a serial number the UI never renders
-- and which would reappear, looking like corruption, if the kind were changed.
--
-- Real columns rather than a JSON blob (unlike info_entries.data) because these
-- column sets are prescribed, not user-defined: typed columns keep the API honest
-- and make an accidental field-name typo a 400 instead of a silent blank cell.
CREATE TABLE IF NOT EXISTS devices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL DEFAULT 'Android',   -- Android | iOS | EDC | Misc
  name       TEXT NOT NULL DEFAULT '',
  version    TEXT NOT NULL DEFAULT '',
  root       TEXT NOT NULL DEFAULT '',
  rom        TEXT NOT NULL DEFAULT '',
  uuid       TEXT NOT NULL DEFAULT '',
  serial     TEXT NOT NULL DEFAULT '',
  edc_type   TEXT NOT NULL DEFAULT '',
  supplier   TEXT NOT NULL DEFAULT '',
  who_used   TEXT NOT NULL DEFAULT '',
  password   TEXT NOT NULL DEFAULT '',
  kernel     TEXT NOT NULL DEFAULT '',
  android    TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  -- Manual ordering set by dragging rows. Defaults to 0 so a table that has
  -- never been reordered keeps its alphabetical order (ORDER BY position, then
  -- name) instead of falling into insertion order.
  position   INTEGER NOT NULL DEFAULT 0,
  -- Values for user-added columns, keyed by device_columns.key. Built-in fields
  -- keep their own real columns; this holds only the ones the user invented, so
  -- widening the inventory never means an ALTER TABLE.
  extra      TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Per-kind column configuration: which columns a type shows, in what order, and
-- any the user added. Seeded from DEVICE_FIELDS the first time a kind is used, so
-- the prescribed layout is the default but not a cage.
CREATE TABLE IF NOT EXISTS device_columns (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  kind     TEXT NOT NULL,
  key      TEXT NOT NULL,
  label    TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  hidden   INTEGER NOT NULL DEFAULT 0,
  -- 1 = one of the prescribed columns (may be hidden or reordered, not deleted);
  -- 0 = user-added (deletable).
  builtin  INTEGER NOT NULL DEFAULT 1,
  UNIQUE (kind, key)
);

CREATE TABLE IF NOT EXISTS projects (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  client         TEXT NOT NULL DEFAULT '',
  client_id      INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  -- The one project manager accountable for this engagement.
  -- Deliberately a single column, not a join table: exactly one PM owns a
  -- project, while a CLIENT may have several default PMs (client_managers).
  manager_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category       TEXT NOT NULL DEFAULT 'Web',
  -- Only meaningful when category = 'Mobile': Android | iOS
  platform       TEXT NOT NULL DEFAULT '',
  env            TEXT NOT NULL DEFAULT 'Dev',
  method         TEXT NOT NULL DEFAULT 'Grey Box',
  status         TEXT NOT NULL DEFAULT 'Incoming',
  notes          TEXT NOT NULL DEFAULT '',
  -- The engagement window, as free-text dates (YYYY-MM-DD). Added by the boot
  -- migration for databases created before they existed — but they belong here
  -- too, or a fresh install would depend on that migration having run.
  started_at     TEXT NOT NULL DEFAULT '',
  ended_at       TEXT NOT NULL DEFAULT '',
  created_by     INTEGER REFERENCES users(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_pentesters (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

-- A retest is a CLIENT REQUEST that queues the project for re-verification.
-- It is not tied to individual findings.
CREATE TABLE IF NOT EXISTS retests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code         TEXT NOT NULL DEFAULT '',
  title        TEXT NOT NULL,
  findings     TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL DEFAULT '',
  requested_at TEXT,
  status       TEXT NOT NULL DEFAULT 'Incoming',
  notes        TEXT NOT NULL DEFAULT '',
  started_at   TEXT,
  ended_at     TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Indexes are created by db.js AFTER migrations run, because several of them
-- reference columns that older databases only gain during migration.

-- Project properties: the categories and statuses a project can carry.
--
-- `key` is what projects.category / projects.status STORE; `label` is what the
-- interface SHOWS. Keeping them apart is what lets an admin rename "Ongoing" to
-- "In progress" without rewriting every project row, and `tone` is the badge colour.
--
-- `locked` marks the rows the workflow itself depends on (Done is terminal, Ongoing
-- pulses, Mobile owns the platform field). Their label, colour and order stay
-- editable; their key can never disappear, because queries compare against it.
CREATE TABLE IF NOT EXISTS properties (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  key        TEXT NOT NULL,
  label      TEXT NOT NULL,
  tone       TEXT NOT NULL DEFAULT 'slate',
  position   INTEGER NOT NULL DEFAULT 0,
  locked     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (kind, key)
);

-- Which schema version this database has been through. Written by the app at the
-- end of a successful boot; it is what makes "what release is this volume on?"
-- answerable with one SELECT instead of guessing from the catalog.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
