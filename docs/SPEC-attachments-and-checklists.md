# Spec — project attachments and security checklists

Two features, one drawer. Both hang off a single project, both are per-project
work product, and both need the same thing from the Admin panel: a catalogue an
admin owns.

Asked for: *"At each project: add feature tab attachment; add checklist security,
the category has a different checklist, can be OWASP or something custom — make
sure the checklist can be custom on the admin panel."*

---

## 1. Attachments

### What it is

Files that belong to an engagement — a signed scope PDF, a client's asset list, a
screenshot of an exploit, the final report. Uploaded from the project drawer,
listed under an **Attachments** tab, downloadable again, deleted by whoever may
delete.

### The decision that matters: where the bytes live

Three options were considered.

| | bytes in DB (`bytea`) | bytes on disk | bytes on disk + object store |
|---|---|---|---|
| dependency | none | none | S3/R2 client + credentials |
| backed up by `pg_dump` | **yes, automatically** | no — needs a second artefact | no |
| dump size | grows 1:1 with uploads | flat | flat |
| restore | one command, already documented | two things to restore, in step | two things, plus a bucket |
| works with SQLite mode | yes | yes | no |

**Chosen: bytes on disk**, in `${DATA_DIR}/uploads/<projectId>/<uuid>`, with the
metadata row in the database. Reasons:

- The alternative that needs no second backup artefact is `bytea`, and that turns
  every nightly dump into a file archive — a 200 MB of reports installation
  produces a 200 MB dump *every night, kept 14 days*. Disk keeps the dump flat.
- The backup service already writes to a host directory (`./backups`). A second
  archive next to it is a small change to a script that already exists, not a new
  system.
- `bytea` also means every upload passes through the database connection and the
  transaction lock. A 15 MB PDF would hold the SQLite write lock for the whole
  insert.

**Consequence, and it must ship with the feature, not after it:** the backup
service gains a `tar czf` of the uploads directory beside the dump, and the README
restore procedure gains the step that puts it back. A backup that silently omits
the files is worse than no attachments at all, because it *looks* complete.

### Transfer encoding: base64 JSON, not multipart

There is no multipart parser in this codebase and adding `multer` (plus its
transitive tree) to move bytes is a poor trade for a feature that uploads one file
at a time. The browser reads the file with `FileReader` and `POST`s
`{ name, mime, data: base64 }`. The server decodes and writes.

- Cost: ~33% wire overhead, and one file in memory at a time.
- Ceiling: **20 MB per file** (`MAX_UPLOAD_BYTES`), refused with a clear message
  before the upload starts. 20 MB is generous for a scope PDF or a report; the
  screenshot folder is what an object store would be for, and that is out of scope.
- The base64 body must be refused *before* it is buffered when
  `Content-Length` already exceeds the encoded ceiling.

### Table

```sql
CREATE TABLE project_files (
  id          SERIAL PRIMARY KEY,           -- INTEGER PRIMARY KEY AUTOINCREMENT on sqlite
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                -- as uploaded, shown to people
  mime        TEXT NOT NULL DEFAULT '',
  size        INTEGER NOT NULL DEFAULT 0,
  stored_name TEXT NOT NULL,                -- uuid; never the user's name on disk
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_project_files_project ON project_files(project_id, created_at DESC);
```

`stored_name` is a random id, not the uploaded name: a client-controlled filename
is a path traversal, a double-extension trick, and a 255-byte problem, all at once.

### Download

`GET /api/project-files/:id/download` streams the file with
`Content-Disposition: attachment; filename*=UTF-8''…` and
`Content-Type: application/octet-stream` — **not** the stored mime. Serving a
client-uploaded HTML or SVG inline from the app's own origin is stored XSS with
extra steps; forcing a download removes the execution context. The CSP already
forbids inline script, but a same-origin document is a same-origin document.

### Routes

| Method | Path | Who |
|---|---|---|
| GET | `/api/projects/:id/files` | anyone signed in |
| POST | `/api/projects/:id/files` | anyone signed in |
| GET | `/api/project-files/:id/download` | anyone signed in |
| DELETE | `/api/project-files/:id` | admin / lead / sub-lead (`requireDeleter`) |

Deleting the row deletes the bytes, in that order: the row is the index, and a
row without bytes is a broken download while bytes without a row are invisible
garbage that only a `find` will ever reveal.

Deleting a project cascades the rows — so `DELETE /api/projects/:id` must remove
the stored files too, and it must read the `stored_name` list **before** the
cascade erases it (the same trap the variant notes had: the child rows are gone by
the time the parent delete returns).

---

## 2. Security checklists

### What it is

A project can carry one or more **checklists** — OWASP Top 10 2021, a company
hardening list, a client's own requirements — each a list of items grouped into
sections, each item marked **Pass / Fail / N/A / Open** with a note and an
optional evidence file (reuses the attachments above, so a finding can carry its
own screenshot).

### Tables

```sql
-- The catalogue, owned by the Admin panel.
CREATE TABLE checklists (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,        -- "OWASP Top 10 2021"
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE checklist_items (
  id           SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  section      TEXT NOT NULL DEFAULT '',   -- "A01 — Broken Access Control"
  title        TEXT NOT NULL,
  help         TEXT NOT NULL DEFAULT '',   -- the one-line "what to test"
  position     INTEGER NOT NULL DEFAULT 0
);

-- A template attached to an engagement.
CREATE TABLE project_checklists (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE RESTRICT,
  created_at   TEXT NOT NULL,
  UNIQUE (project_id, checklist_id)
);

-- One row per answered item. An unanswered item has no row: absence is "Open",
-- which keeps a 120-item template from writing 120 empty rows on attach.
CREATE TABLE project_checklist_items (
  project_checklist_id INTEGER NOT NULL REFERENCES project_checklists(id) ON DELETE CASCADE,
  item_id              INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'Open',   -- Open | Pass | Fail | N/A
  note                 TEXT NOT NULL DEFAULT '',
  file_id              INTEGER REFERENCES project_files(id) ON DELETE SET NULL,
  updated_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at           TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (project_checklist_id, item_id)
);
```

**Template edits propagate.** A project links the template rather than copying its
text, so fixing a typo in a checklist fixes it everywhere. The cost is that editing
a template mid-engagement changes what past projects show — accepted, because this
application tracks engagements rather than certifying them, and the alternative
(snapshotting item text per project) doubles the tables and still cannot answer
"what did this say in March" without a full audit log.

`ON DELETE RESTRICT` on `project_checklists.checklist_id` makes that visible: the
Admin panel refuses to delete a checklist that is in use, and says how many
projects use it. A cascade here would silently delete someone's completed work.

### Seeded templates

Seeded on first boot like the properties are (`INSERT … ON CONFLICT DO NOTHING`),
so a fresh install has something to attach immediately:

- **OWASP Top 10 2021** — ten sections, one item each, `help` naming the test.
- **Web hardening basics** — headers, TLS, cookies, error handling, file uploads,
  rate limiting, logging. Ten items.

Both are ordinary rows afterwards: editable, extendable, deletable when unused.

### Status vocabulary

`Open | Pass | Fail | N/A`. Four values, not a score. `Fail` is what feeds the
retest conversation and what a summary counts; a percentage would invite arguing
about weighting instead of fixing the finding.

### Progress

Per checklist: `12 / 34 answered · 3 fail`. Shown on the tab, on the checklist
card, and as a badge in the drawer's meta row when any item is `Fail` — the one
number a supervisor actually wants from across the room.

### Routes

| Method | Path | Who |
|---|---|---|
| GET | `/api/checklists` | anyone signed in (the picker needs it) |
| POST | `/api/checklists` | admin / lead / sub-lead |
| PATCH | `/api/checklists/:id` | admin / lead / sub-lead |
| DELETE | `/api/checklists/:id` | `requireDeleter`, refused when in use |
| POST | `/api/checklists/:id/items` | admin / lead / sub-lead |
| PATCH | `/api/checklist-items/:id` | admin / lead / sub-lead |
| DELETE | `/api/checklist-items/:id` | admin / lead / sub-lead |
| GET | `/api/projects/:id/checklists` | anyone signed in |
| POST | `/api/projects/:id/checklists` | anyone signed in |
| DELETE | `/api/project-checklists/:id` | `requireDeleter` |
| PATCH | `/api/project-checklists/:id/items/:itemId` | anyone signed in |

Answering an item is a pentester's job, so it is open to everyone signed in —
the same rule as editing a device. Deleting a whole checklist *off a project*
destroys work, so it is gated.

Bulk import of a checklist from pasted text (`section | title | help` per line) is
part of this: an admin typing forty items by hand will do it once and never again.

### Drawer

Tabs become `Overview · Checklist · Attachments · Retests · Notes`, with counts on
Retests, Checklist (failures) and Attachments.

The checklist tab renders one card per attached template: header (name, progress,
detach button), then sections, then items. Each item row: a four-way segmented
control, the item title, the help text behind a disclosure, and a note box that
saves on blur. Unanswered items collapse to one line; a fail expands its note.

Detaching asks first and names the answered-item count, because that is work.

### Admin panel

New section **Checklists** next to Clients and Manage users: a list of templates
with item counts and usage counts, a form to create/rename, an item editor
(section, title, help, drag to reorder), a paste-import box, and a delete that
explains itself when the template is in use.

---

## Permissions, in one table

| Action | Member | Sub Lead | Lead | Admin |
|---|---|---|---|---|
| Upload an attachment | ✓ | ✓ | ✓ | ✓ |
| Download an attachment | ✓ | ✓ | ✓ | ✓ |
| Delete an attachment | ✗ | ✓ | ✓ | ✓ |
| Attach / detach a checklist | ✓ | ✓ | ✓ | ✓ |
| Answer a checklist item | ✓ | ✓ | ✓ | ✓ |
| Create / edit a template or item | ✗ | ✓ | ✓ | ✓ |
| Delete a template | ✗ | ✓ | ✓ | ✓ (only when unused) |

## Migration

`SCHEMA_VERSION` 18 → 19. Five new tables, no changes to existing columns, so no
rebuild is needed; `recordSchemaVersion()` and the half-applied-migration guard
already cover the rest. The upload directory is created on boot beside `DATA_DIR`.

## Out of scope

- Versioning of templates, per-project snapshots of item text.
- Object storage, resumable uploads, thumbnails, virus scanning.
- Attachments on clients/applications/retests — projects only, until someone asks.
- Scoring or dashboards across projects.

## Acceptance

1. A file uploads from a project drawer, appears in the tab with size and uploader,
   downloads byte-identical, and is refused at 20 MB with a readable message.
2. Deleting an attachment deletes its bytes; deleting the project deletes the
   directory, with no orphan files left on disk.
3. `GET /api/project-files/:id/download` always answers as a download, never inline.
4. A Member sees no delete control on any attachment or checklist.
5. A checklist can be created in the Admin panel, given sections and items, and
   attached to a project; answering an item survives a reload; detaching names the
   work it destroys.
6. Deleting a checklist that is in use is refused, with the count.
7. A fresh install arrives with OWASP Top 10 2021 and Web hardening basics ready
   to attach.
8. A prod boot writes the uploads archive beside the database dump, and the README
   says how to restore both.
9. `npm test` covers: upload size and type refusal, the download headers, deletes
   with their permission boundaries, checklist CRUD, attach/answer/detach, the
   in-use delete refusal.
