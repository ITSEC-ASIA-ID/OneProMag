-- OneProMag schema — PostgreSQL
-- Mirrors server/schema/sqlite.sql one-for-one so the same queries work on both.
-- Timestamps stay ISO-8601 TEXT (not timestamptz) to keep shapeProject()/shapeRetest()
-- identical across drivers and to avoid a timezone conversion in the API contract.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
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
  -- Contact details. Free text: phone numbers are written in many local
  -- formats, so nothing is normalised or validated beyond trimming.
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  -- Last authenticated request, written at most every ~20s (see touchPresence).
  -- "Who is online" is a courtesy badge, not an audit log.
  last_seen_at  TEXT NOT NULL DEFAULT '',
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
  id         SERIAL PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL,
  short_name TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- Which project supervisors usually handle a client. Mirrors client_supervisors in
-- sqlite.sql: many-to-many, so one SV can own several clients and a client can
-- be covered by several SVs.
CREATE TABLE IF NOT EXISTS client_supervisors (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, user_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id         SERIAL PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (client_id, name)
);

-- A variant app is a child of an application: the same client's product, shipped
-- in several shapes — "Mobile Banking App" with an Android build, an iOS build and
-- a partner-branded build, say. It is optional at every level: an application may
-- have none, and a project may point at none.
CREATE TABLE IF NOT EXISTS application_variants (
  id             SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  -- A sub app is just a name: the team already knows what "Brilink MPOS" is, and
  -- asking for a package name and a version to describe it was inventing work.
  name           TEXT NOT NULL,
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  UNIQUE (application_id, name)
);

-- Free-form information library (see the SQLite schema for the reasoning).
CREATE TABLE IF NOT EXISTS info_entries (
  id         SERIAL PRIMARY KEY,
  scope      TEXT NOT NULL,
  scope_id   INTEGER NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT 'General',
  kind       TEXT NOT NULL DEFAULT 'text',
  data       TEXT NOT NULL DEFAULT '',
  env        TEXT NOT NULL DEFAULT 'Dev',
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  scope      TEXT NOT NULL,
  scope_id   INTEGER NOT NULL,
  -- A Dev and a Prod sheet per application; clients only have Dev.
  env        TEXT NOT NULL DEFAULT 'Dev',
  text_body  TEXT NOT NULL DEFAULT '',
  table_json TEXT NOT NULL DEFAULT '',
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (scope, scope_id, env)
);

CREATE TABLE IF NOT EXISTS devices (
  id         SERIAL PRIMARY KEY,
  kind       TEXT NOT NULL DEFAULT 'Android',
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
  id       SERIAL PRIMARY KEY,
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
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  client         TEXT NOT NULL DEFAULT '',
  client_id      INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  -- Which variant of the application this engagement tests. Optional: most
  -- projects test the application itself.
  variant_id     INTEGER REFERENCES application_variants(id) ON DELETE SET NULL,
  -- The one project supervisor accountable for this engagement. Single column on
  -- purpose: a project has exactly one SV, while a client may have several
  -- default SVs (client_supervisors).
  supervisor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
  id           SERIAL PRIMARY KEY,
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

-- Project properties (see the SQLite schema for the full note). `key` is the stored
-- value, `label` the displayed one, `locked` marks the rows the workflow depends on.
CREATE TABLE IF NOT EXISTS properties (
  id         SERIAL PRIMARY KEY,
  kind       TEXT NOT NULL,
  key        TEXT NOT NULL,
  label      TEXT NOT NULL,
  tone       TEXT NOT NULL DEFAULT 'slate',
  position   INTEGER NOT NULL DEFAULT 0,
  locked     BOOLEAN NOT NULL DEFAULT false,
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
