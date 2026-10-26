# OneProMag

Simple, modern **pentest project management**. Track engagements per client, assign
pentesters, and manage client retest requests — Postgres-backed, Docker-first,
no build step.

![docker](https://img.shields.io/badge/docker-compose-2496ED) ![db](https://img.shields.io/badge/db-postgresql%2017-336791) ![stack](https://img.shields.io/badge/node-%3E%3D22.5-339933) ![build](https://img.shields.io/badge/build_step-none-success)

---

## Quick start — Docker

```bash
docker compose up --build
# → http://localhost:3131
```

That is the whole setup: the app plus a PostgreSQL 17 database, wired together.
Data lives in the `onepromag-pgdata` volume, so it **survives** every rebuild.

```bash
docker compose up --build -d     # run in the background
docker compose logs -f           # follow logs
docker compose down              # stop (data is kept)
docker compose down -v           # stop and delete the database volume
```

Port 3131 already taken? Pick another host port without editing any file:

```bash
APP_PORT=8080 docker compose up --build
# → http://localhost:8080
```

### SQLite fallback (no database container)

The data layer supports both engines behind one interface. To run without
Postgres at all:

```bash
DB=sqlite docker compose up --build onepromag
# SQLite file in the `onepromag-data` volume, no db container started
```

This is the escape hatch if you want a single-container deployment, or need to
roll back after migrating. See [Database](#database) for the trade-offs.

### Quick start — without Docker

Requires **Node.js ≥ 22.5**. Postgres path needs a reachable server; SQLite path
needs nothing.

```bash
npm install          # installs `pg` (the only dependency)
npm start            # → http://localhost:3131, SQLite by default
```

```bash
# against PostgreSQL instead
DB=postgres PGHOST=localhost PGUSER=onepromag PGPASSWORD=... PGDATABASE=onepromag npm start

# or shorthand (reads DATABASE_URL / PGHOST env vars)
DATABASE_URL=postgres://user:pass@localhost:5432/onepromag npm start
```

Engine selection order:

1. `DB=postgres` / `DB=sqlite` if set explicitly
2. otherwise Postgres if `DATABASE_URL` or `PGHOST` is set
3. otherwise SQLite

Other scripts:

```bash
PORT=4173 npm start   # different port
npm run dev           # auto-restart on file change
npm run reset-db      # wipe the SQLite file, re-seed on next start
```

### Demo accounts

| Username | Password       | Role      | Level    |
| -------- | -------------- | --------- | -------- |
| `admin`  | `admin123`     | Admin     | Lead     |
| `rafi`   | `pentester123` | Pentester | Lead     |
| `dewi`   | `pentester123` | Pentester | Sub Lead |
| `bagas`  | `pentester123` | Pentester | Member   |
| `sinta`  | `pentester123` | Pentester | Member   |
| `yoga`   | `pentester123` | Pentester | Sub Lead |
| `fajar`  | `pentester123` | Pentester | Member   |
| `nadia`  | `pentester123` | Pentester | Member   |
| `rina`   | `manager123`   | Project Manager | —  |
| `hendra` | `manager123`   | Project Manager | —  |

The pentest tree has two branches: `admin → dewi → bagas, sinta` and
`rafi → yoga → fajar, nadia`. That is what the team status board renders as
Lead, Sub Lead, Member, Member, Lead, Sub Lead, Member, Member. Fajar ships with
a manual `Exam` status so both an automatic and a manual row are visible out of
the box.

`rina` and `hendra` are **Project Managers** — a separate role, not part of the
pentest tree. Bank Nusantara and Dompet Kita name both of them as default PMs;
the other three clients name one each, so you can see both the single-PM and the
multi-PM auto-selection behaviour on the create form.

New accounts can also be created from the **Register** link on the login page.
Self-registration always produces an ordinary pentester at level **Member** — the
role, level and reporting line are decided by the server, never by the request,
so nobody can register themselves an admin. Promote someone (or mint a Project
Manager) from the Admin panel. Demo data is only seeded into an empty database.

---

## Running in production

`docker-compose.yml` is the development file: it publishes `3131` on the host and
runs the app straight from the working tree. `docker-compose.prod.yml` is the
deployment file — the same image, wrapped properly:

```bash
# 1. DNS: point a record at the host. For a LAN install addressed by IP, skip this.
cp deploy/.env.example .env      # then edit: DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD
mkdir -p backups                 # only needed if you enable the backup profile
docker compose -f docker-compose.prod.yml up -d --build
curl -f https://onepromag.example.com/healthz     # -> {"ok":true,"db":"ok",...}
```

A password is required, not defaulted: `${POSTGRES_PASSWORD:?…}` makes compose
refuse to start rather than bring up a cluster whose password is `onepromag`.

### What changes between the two files

| | `docker-compose.yml` (dev) | `docker-compose.prod.yml` |
| --- | --- | --- |
| Published ports | app `3131`, db none | proxy `80`/`443` only — app and db publish **nothing** |
| TLS | none | Caddy, automatic certificate + renewal |
| Database password | defaults to `onepromag` | required, no default |
| Session cookie | `HttpOnly; SameSite=Lax` | adds `Secure` (`COOKIE_SECURE=1`) |
| Root filesystem | writable | app container is **read-only**, only `/tmp` (tmpfs 32 MB) and `/data` writable |
| Capabilities | default | `cap_drop: ALL` + `no-new-privileges` on every service |
| Logs | unlimited json-file | 10 MB × 3 files per service |
| Restart | `unless-stopped` | same, plus `init: true` so SIGTERM reaches node and it closes the listener cleanly |
| Health | `GET /` | `GET /healthz` — includes a database round trip |
| Backups | — | opt-in nightly `pg_dump` profile |

### TLS, and the one setting that breaks logins

`COOKIE_SECURE=1` (the prod default) marks the session cookie `Secure`, so a
browser will not send it over plain HTTP. That is the right behaviour behind
Caddy — until you put the app behind *your own* proxy and address it as
`http://…`: the login then appears to succeed and the next request is anonymous
again, because the browser discarded the cookie. Two correct setups:

- **Caddy in front (default).** `DOMAIN=onepromag.example.com`, `ACME_EMAIL` set,
  ports 80/443 reachable, `COOKIE_SECURE=1`.
- **HTTP-only LAN install.** `DOMAIN=:80`, `COOKIE_SECURE=0`. The cookie travels
  in clear text; that is acceptable only on a network you trust.
- **Your own reverse proxy.** Drop the `proxy` service, publish the app on the
  loopback only (`ports: ['127.0.0.1:3131:3131']`) and keep `COOKIE_SECURE=1`.

### Backups

```bash
docker compose -f docker-compose.prod.yml --profile backup up -d   # start
docker compose -f docker-compose.prod.yml --profile backup stop     # stop
```

Every `BACKUP_INTERVAL_SECONDS` (default 86400) the container writes
`backups/onepromag-YYYY-MM-DD-HHMM.sql.gz` and deletes dumps older than
`BACKUP_KEEP_DAYS` (default 14). The dump is `--no-owner --no-privileges`, so it
restores into any cluster with any user:

```bash
gunzip -c backups/onepromag-2026-10-26-1355.sql.gz \
  | docker exec -i $(docker compose -f docker-compose.prod.yml ps -q db) \
      psql -U onepromag -d onepromag
```

Set `HOST_UID=$(id -u)` and `HOST_GID=$(id -g)` in `.env` so the files land owned
by you instead of root. Dumps are written to `./backups`, which git ignores —
copy them off the machine if losing the host is part of your threat model.

### Upgrading

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run on boot and are safe to re-run; sessions live in the database, so
a rebuild does not log anyone out. Two things worth knowing:

- **One app container.** The property list (categories/statuses) is cached in
  process memory and cleared by the replica that writes it, so a second replica
  would serve a stale list until it restarted. Everything else — sessions,
  passwords, data — is in Postgres, so nothing else depends on which container
  answers.
- **`read_only: true`** means a future feature that writes to disk will fail
  loudly at deploy time rather than silently filling the container layer. If you
  add one, give it a named volume; **do not enable the SQLite fallback in prod** —
  it puts the whole database inside a single container's volume with no online
  backup path.

### Health

`GET /healthz` answers two questions at once: the process is up, *and* `SELECT 1`
against Postgres succeeded within two seconds. It returns `503` with
`{"ok":false,"db":"down"}` when the database is unreachable and `200` again once
it returns — no restart needed. Docker's healthcheck, the Caddy upstream check
and any external monitor can all use it; it needs no session and reveals nothing
but a boolean plus an uptime counter.

## Features

### Auth
- Username + password login with `scrypt` hashing and per-user random salt
- Server-side sessions (`HttpOnly`, `SameSite=Lax` cookie), 14-day expiry
- Self-service registration with username/password validation
- Light & dark theme, remembered in `localStorage`

### Signing in

The login field accepts **either a username or an email address**. A username
always wins the lookup — usernames are unique and validated, while emails are free
text an admin or the user themselves typed in — so someone whose name happens to
look like a colleague's address can still sign in as themselves. Emails match
case-insensitively.

If two accounts share an email, the login is **refused** with
`409 That email is used by more than one account. Sign in with your username instead.`
Guessing which account was meant would sign people into the wrong one, which is
worse than an error message.

### Roles & hierarchy
Every pentester carries a **sub-role**, ordered `Lead → Sub Lead → Member`.

- The level is shown as a small pill on cards, in the drawer and in the picker.
- In the project drawer the team is **grouped by level** so you can see who runs it.
- The account menu visualises the hierarchy with your level highlighted.
- **Admin, Lead and Sub Lead** can manage the client/application catalogue and
  see the Admin panel. Members cannot.

Besides `Pentester` and `Admin` there is a third role, **`Project Manager`**
(`role: 'Project Manager'` in `ENUMS.role`):

- A PM **owns engagements** rather than testing them, so PMs never appear in the
  "Who pentest" picker and never appear on the team status board.
- Every user row carries `phone` and `email`. The drawer renders them as
  `tel:` / `mailto:` links, and the admin pages show them on each card.
- PMs are curated under **Admin panel → Manage users**.

### Project list
- **Grid card view is the default**; table view is one click away, both remembered
- Live search across name, client, application and notes (160 ms debounce, keeps focus)
- Filters: client, application, category, **status**.
  Status filtering replaced the old "By status" sidebar group — one control instead
  of six nav rows. Environment and method are no longer filterable (they remain
  project fields and are still accepted by the API)
- **The app opens on Active projects**, which is the day-to-day view
- Sidebar scopes, in order: Active projects / All projects / **My active projects** /
  **My all projects**, plus a separate **Admin panel** group for privileged users
  (and **Team status**, **Users** and **Devices** above the scopes)
### Users

The staff directory: everyone with a login, one row each, as a table of
**Full name · Role · E-mail · Number phone**. Reachable from the sidebar by anyone —
a tester looking for the project manager who owns the engagement should not have to
ask an admin.

The Role column carries the account's role and, for pentesters and admins, their
level as a chip (*Lead*, *Sub Lead*, *Member*), because "Pentester" alone does not
tell you which one to ask. The e-mail and the number are `mailto:`/`tel:` links, so
they work from a phone; clicking the avatar opens that person's card.

This is deliberately **not** the admin tree. Looking someone up is a lookup, and
hierarchy is the wrong shape for it, so the page is sorted alphabetically and has
one search box over every column. The phone is also matched on digits alone, with
`+62` and `0` treated as the same prefix — a number read off the screen as
`+62 812 1000 0005` is typed back as `0812 1000 0005`.

Managing the same people — creating accounts, importing a team, moving someone in
the reporting tree — is **Admin panel → Manage users** (*Accounts and roles* below).

### Information center

Free-form notes for every **client** and every **application**, so the next
tester on an engagement does not have to rediscover the environment.

Reached from the sidebar. Two panes: the client/application tree on the left with
per-target note counts, the note library on the right.

The left tree is **one collapsible group per client**, with its applications
nested underneath. A client with a dozen applications used to push everything else
out of reach, and a flat list made it hard to see which applications belonged
together. Each group has a chevron; the group holding the current selection is
always open, so clicking an application can never leave the active row hidden
inside a collapsed parent.

### The table sheet behaves like the Devices sheet

The fixed **Table** document and the **Devices** inventory are the same table in
the same clothes: one sticky uppercase header, one row rhythm, one set of controls —
and, on first sight, **no controls at all**. That is deliberate rather than
cosmetic: a tester who has learned the Devices table already knows this one.

Keeping them identical takes one thing worth knowing: they must share a **single**
rule set, not two that look alike. The sheet originally had its own `.ic-table`
block, and over a few months the two drifted — the sheet's rows were 47px against the
inventory's 40px, its headers aligned `top` against `middle`, and every cell carried
`pre-wrap` and `tabular-nums` the inventory never got. Nothing was individually wrong;
the two had simply been edited by different changes. The sheet now wears `.dev-table`
and emits the **same view-mode markup** `devicesTableHTML` emits, so a change to one
is a change to both, and no rule has to state that they match.

Sharing the markup matters more than sharing the colours. An earlier version already
shared every cell property and still looked like a different table, because the sheet
kept a grip column, two per-row buttons, a `+` in the header and a trailing *Add row*
while it was being **read**. Those controls made its rows taller and put widgets along
both edges that the inventory's first page does not have. Devices had already settled
that argument: nothing is draggable, deletable or addable until you press **Edit all
rows**. The sheet obeys the same rule through its own **Edit** button.

One difference is intentional and is the only one: on a phone the sheet keeps its
table (a credentials grid means nothing as a stack of cards, because the row/column
relationship *is* the information) while the inventory switches to cards.

Reading the sheet is exactly reading the inventory. Editing it opens the grid editor,
where the structural work happens:

- **Drag a column** by its grip to reorder it. The header label and every cell below
  it move together, because moving the header alone would silently re-label the data.
- **Move a row** up or down with the arrows at the end of the row, or drag it.
- **Add a column** or **a row** with the buttons under the grid.
- **Delete** a row or a column with the `×` beside it. The last remaining row and
  column cannot be deleted — a table with nothing in it has nowhere to type.

The sheet saves on **Save**, so a reorder survives a reload. Saving sends only the
`table` half of the document, so dragging a column can never blank the prose below it.

Note cards render the identical table, because it is the same call: a card has no
order of its own to persist, so nothing there is draggable either.

When the table is wider than the pane, a fade and a `Scroll sideways for the
remaining columns` hint appear on the side that has more to show — the same wrapper,
the same measurement and the same function the inventory uses. Both are measured on
load as well as on scroll; otherwise a wide table just looks cut off until you happen
to drag it.

### Dev and Prod sheets on applications

Every **application** carries **two independent sets** of those documents, one per
environment, selected with a **Dev / Prod** switch above the blocks. **Dev is the
default** — production testing is the exception, and landing on Prod by accident
would be a foot-gun, so the switch always opens on Dev even if the last
application you looked at was on Prod.

The two sets are genuinely separate: `documents` is keyed on
`(scope, scope_id, env)`, so writing the Prod sheet leaves the Dev notes and table
completely untouched, and the seeded demo application shows visibly different
content on each page.

Clients have **no** Prod sheet. A client is an organisation, not a deployment, so
the switch is not rendered for a client and the API refuses `env=Prod` on a client
scope with `400 Only applications have a production environment` rather than
writing to a row nobody would ever open.

Switching environment while a block is being edited discards the unsaved edit
instead of carrying it across — a half-written Dev note must never land in Prod.

Two things sit below the fixed sheets and they are deliberately named apart: the
**Notes** document (one prose page per sheet) and the **Extra notes** list (separate
cards, the list counted and labelled "Filed on the Dev/Prod sheet"). Without
distinct names the two read as competing places to write a note.

**Notes are filed per sheet too.** Everything on the page below the sheets — the
note cards, their editor and the search results — belongs to the environment you
are currently looking at. A note written on Dev does not appear on Prod and vice
versa, each note stores its own `env`, and the note dialog names the sheet it will
land on (`Brilink — Bank Nusantara · Prod sheet`). Editing a note keeps it on the
sheet it already belongs to, so a Prod note opened while the page happens to be on
Dev is never silently re-filed. Jumping to a note from search switches to that
note's own sheet first — otherwise a Prod match would land on the Dev page and look
missing. Search results carry a small `DEV` / `PROD` tag next to the application
name, and so does every note card — the switch scrolls out of view, so a card
without its own marker would lose the only clue to which environment it belongs
to. Client-level notes are always Dev, because a client has no production page.

Each sheet heading repeats the environment as a **Dev** / **PROD** pill, and a Prod
heading also carries a rose rule down its left edge. The switch sits above both
blocks, so a reader who has scrolled into the table would otherwise have no way to
tell whether the credentials in front of them are production ones.

Each target owns, above the note list, **two fixed documents**: the **Table** first
and the **Notes** underneath. The table is the reference material a tester opens
the page for; the prose reads as commentary below it. Both always exist, so there
is nothing to name before you can start writing — pick the target, click **Edit**
on either block, write, **Save**.

| Block | Storage | Edited by |
|---|---|---|
| **Table** (first) | `documents.table_json` | an `Edit` button reveals the same grid editor the table notes use. Columns can be reordered by **dragging** them, or with the arrow buttons |
| **Notes** (below) | `documents.text_body` | an `Edit` button reveals a **Markdown** textarea; `Ctrl/⌘+Enter` saves, `Escape` or `Cancel` discards |

### Markdown in the notes block

The notes sheet renders **Markdown**, because a pentest note is a document —
headings, numbered steps, fenced commands — far more often than it is a wall of
prose. A fenced code block keeps its exact alignment, which is what the old
monospaced block was really for.

Supported: `#`–`######` headings (`#` maps to `<h2>`, since an `<h1>` inside a card
is wrong), `**bold**`, `*italic*`/`_italic_`, `` `inline code` ``, ` ``` ` fenced
blocks, `-`/`1.` lists, `>` blockquotes, `---` rules, `| pipe |` tables, and
`[label](url)` links.

The renderer **escapes every character of input before it emits any tag of its
own**, and only `http(s)`, `mailto` and `tel` links survive — anything else
(including `javascript:`) is left as literal text. That matters because all
signed-in users share these documents.

Blocks render **read-only until Edit is clicked**. That is deliberate: a
credentials grid you can clobber with a stray keystroke is a support ticket
waiting to happen, and read-only is what makes the text comfortably readable while
browsing. Only one block is in edit mode at a time, and leaving it without saving
never writes anything.

Saving one block never touches the other: the API takes `text` and `table`
independently and only updates the fields present in the request. A target with no
saved document yet returns an empty one rather than a `404`, so the page always
renders the same two blocks — with an invitation to start writing instead of
something that looks broken.

Stored in `documents`, keyed by `(scope, scope_id, env)` — the same
client/application pairing the notes use, plus the environment — and rows are
removed with their target. `updated_by` is kept so the footer can say who last
touched it.

The rest of the pane is the note list.

| Field | Notes |
|---|---|
| Title | required for tables; for text notes a body alone is still valid |
| Type | **Text** or **Table** |
| Category | **free text** with a few suggestions (General, Credential, Common Error, Link, Access, Config) — not an enum, because every client records different things |
| Content | depends on the type: a plain-text body, or a grid |
| Pinned | floats to the top of the list |

**Text** notes (the cards in the list below, not the block) are deliberately **not**
a fixed schema and **not** parsed Markdown: the body is escaped and rendered in a
monospaced block, so pasted credentials, indented logs and quoted error text
survive exactly as typed. Wrap anything that needs to stay aligned in a fenced
block when writing the block above. Anything with
`credential` and `common_error` columns would force every client's habits into one
shape, which is the opposite of what this page is for.

**Table** notes are for the case where a plain block is the wrong shape —
credentials above all. The grid is built in the editor and stored as JSON in
`info_entries.data` (`{"columns":[…],"rows":[[…]]}`), with `kind='table'`. It is
rendered as a real `<table>`, so alignment is the browser's job rather than a
column-counting exercise.

Editing a table: **+ Row** / **+ Column** add, and each header carries move-left,
move-right and delete controls while each row carries move-up, move-down and
delete. Moving a column moves its cells with it — otherwise the data would stay
behind and silently reassign itself to a different label. `Enter` in a cell adds a
row below and lands in it, `Tab` from the last cell adds the next row, and pasting
a tab/newline block fills downwards from the focused cell, which is how a
credentials dump actually arrives. The grid is bounded (40 columns, 500 rows,
2000 characters per cell) so one note cannot become a multi-megabyte row.

**Search** covers every note regardless of which client or application it belongs
to — title, body, category and the contents of table cells. Each hit names its
client and application and shows the matching fragment; clicking one jumps to that
note on its own page. `GET /api/info/search?q=` needs at least two characters.

Deleting a client or application deletes its notes with it. `scope_id` cannot be
a foreign key (it points at `clients` **or** `applications` depending on `scope`),
so nothing cascades at the SQL level: the delete handlers remove the dependent
notes explicitly, and the application ids are read *before* the client row goes,
because applications declare `ON DELETE CASCADE` and would otherwise vanish first.
A boot-time sweep also deletes notes whose target no longer exists, so rows
orphaned by older releases do not linger unreachable.

Notes hang off a client *or* an application (`info_entries.scope` /
`scope_id`); the two lists are independent, so a client-level note is shared
context and an application note is specific to that app. Pinning does not move the
`updated_at` timestamp — a bookmark is not an edit, and bumping it made every
pinned note claim "edited just now" and reshuffled the order.

Everyone can read and write notes; the author is recorded and shown in the footer.

- **Contact details**, from the account menu → **Edit contact**. A user can change
  their own phone number and email. Name, role, level and reporting line are
  **not** editable there: those are set by whoever administers the team, and a
  self-service form that could change them would be a privilege escalation in one
  field. The form shows those fixed values so it is clear why they are absent.
  Email is shape-checked but not uniqueness-checked — the login path refuses an
  ambiguous shared address instead of this form quietly taking an address off a
  colleague. Your email doubles as a login name.

- **Change password**, from the account menu (click your name at the bottom of
  the sidebar). Requires the current password, enforces the same 6-character
  minimum the API uses, and signs out every OTHER device on success while
  keeping the current one signed in. A wrong current password is a `400`, never
  a `401`, so a typo cannot trip the global "session expired" handler and throw
  you back to the login screen.

- Sidebar counts are deliberately uneven: **Team status**, **All projects** and
  **My all projects** carry none — the four stat cards already report those totals,
  so a second copy on the nav row was redundant ink. Active projects, My active
  projects and the Admin-panel rows keep theirs because nothing else on screen
  shows them
- Sidebar numbers are deliberately uneven. **Active projects**, **My active**,
  **My all** and every Admin-panel row carry a live count; **Team status** and
  **All projects** carry none. A count is only worth showing when it tells you
  something at a glance — the team size and the grand total do not change often
  enough to earn the ink, and putting a number on every row made the two that
  matter (your own workload) invisible. `GET /api/stats` returns `mineActive` and
  `mineAll` computed with the *same* predicate as `GET /api/projects?mine=1`, so a
  count can never disagree with the list it links to
- **Active projects** = everything still in flight. A project whose pentest is
  `Done` but which still has an **open client retest** stays here — the retest is
  work that is not finished yet
- **My active projects** = the Active rule, narrowed to engagements you are on;
  **My all projects** = every engagement you are on, finished or not
- **Finished engagements are reached through the status filter** (`Done`), which is
  the only place they appear now that the dedicated Finished page is gone. An
  explicit status filter always wins over the Active scope, so picking `Done` while
  on Active projects does show them
- A project waiting on an open client retest is labelled **`Retest - <name>`** in
  the Active view, so it is obvious the pending work is a re-verification
- Stat cards: **Total projects / Ready / Active / Retest queue** — Ready is the
  "report being prepared" bucket, sitting next to Active
- **The stat cards follow the scope.** On a company scope they report every
  project; on **My active projects** / **My all projects** they report only yours.
  A small marker above the strip says which ("Everyone's projects" /
  "Only your projects") so the numbers changing never looks like a glitch.
  Both variants come from one SQL shape in `GET /api/stats` (`scopes.all` /
  `scopes.mine`) so the two can't drift, and each card is verified to equal the
  length of the list it sits above
- **Quick status** — click a project's status pill (table row, grid card, or drawer)
  to change status in one click, without opening the edit form
- **Quick assign** — the `+` beside the pentester avatars (table row and grid card)
  opens a focused **Who pentest** dialog with just the picker, not the whole project
  form. Notes get the same treatment: **Edit notes** opens a one-textarea dialog.
  Each of these `PATCH`es only its own field, so nothing else about the project moves
- **The Project column owns the spare width.** Table layout is auto, so every column
  would otherwise share the surplus — the name column ended up narrower than
  Category. Giving `width: 1%` to every column except the first makes the project
  name the only shrink-to-fit cell, so it absorbs all the remaining space
  (~576px of 1138 at 1440 wide) while the badges keep their natural size
- **Delete sits beside Edit** in the drawer header rather than in a separate
  danger zone at the bottom of the Overview tab
- Table columns: Project / Category / **PM** / Pentesters / Retests / Status. There is
  no Client column — the client is folded under the project name as
  **`Client – Application`** (e.g. `Bank Nusantara – Qitta`), so nothing is lost while
  the table gains a whole column of breathing room.
- **Every pentester gets an avatar** — the stack is never capped and there is no
  `+N` counter. A counter told you how many but not *who*, so a five-person project
  looked the same as a two-person one until you opened it. Seven avatars still fit
  a 196px cell with room to spare, so the count was buying nothing.
- Category is a **single pill**. A Mobile project reads `Mobile Android` rather than
  a `Mobile` pill stacked above a separate `Android` pill, which in a narrow cell
  wrapped onto its own line and looked like two unrelated labels.
- The **PM** column is icon-only: the manager's avatar, with their full name in the
  tooltip. Clicking it opens that person's detail card (see *People* below).
  The Project column absorbs the spare width (see *Quick assign* above for how)
  and its `Client – Application` sub-line wraps, so long names stay on one line
  instead of truncating
- Keyboard shortcut <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> to jump to search

### Devices

The hardware inventory: the phones, terminals and miscellaneous kit the team
actually tests with, so nobody re-images a device someone already prepared.

Reached from the sidebar. Four type tabs, and **each type has its own columns** —
a deliberate difference from the Information center's free-form tables, because a
phone and a payment terminal have nothing to compare:

| Type | Columns |
| --- | --- |
| **Android** | Name Device · Version · Root · ROM · Who Used · Notes |
| **iOS** | Name Device · Version · UUID · Who Used · Notes |
| **EDC** | Name Device · Unique ID (SN) · Type · Supplier · Who Used · Password · Kernel · Android · Notes |
| **Misc** | Name Device · Who Used · Notes |

The column sets above are the **prescribed defaults**, and each type's layout is
then editable — the equivalent of the Information center's grid editor, scoped to
an inventory sheet. The **Add column** button in the edit bar opens the editor that
renames, reorders, hides, adds or deletes columns for that type only; the arrangement
is saved per type.

Built-in columns are real columns in the `devices` table (`DEVICE_FIELDS` in
`server/db.js` is the single authority on which kind owns which field); columns you
add yourself are stored as keys in a `devices.extra` JSON blob. Deleting a custom
column deletes its values with it, since nothing would ever display them again.

The layout itself lives in the `device_columns` table. On the first read of a kind
it is seeded from `DEVICE_FIELDS` — so the default is exactly the list in the table
above — and then persisted, which is what lets a user delete even a prescribed
column without it reappearing on the next load. Marking a column `hidden` keeps its
data; it only stops being rendered and stops being asked for in the form.

Columns can be reordered by dragging a column header sideways, or by the arrows in
the **Columns** editor. A hidden column keeps its slot: the saved config is rebuilt
by substituting the new visible order into the non-hidden positions, so hiding a
column and then moving its neighbours does not shuffle it to the end.

Adding things: the trailing row under the last row holds **Add a row**, which inserts an
empty row without leaving the grid; the edit bar above the table holds **Add column**,
immediately left of **Add device**. In view mode there is no trailing row at all.

Each add-control sits with its own kind. A row belongs to the body of the table, so
adding one is a row-level action at the bottom of that body. A column is a property of
the sheet's schema, like the record itself, so adding one is a sheet-level action in the
bar that already creates records. **Add column** sits directly beside **Add device**
rather than further left, so the two ways to grow this sheet are one click apart. The
header `+` that also added a column was removed: three entry points for two actions is a coin
toss, and the header one sat exactly where a column's own control would go.

#### Reading and correcting are two modes

The sheet has a deliberate split, driven by the two different jobs it serves:

**View mode** is for reading, and it is deliberately *quiet*. The page header shows a
single **Edit all rows** button. Rows carry no Edit or Delete buttons, there is no
actions column, and **no drag handles exist anywhere** — not the per-row grip on the
left, not the per-column grip in the header. Adding a device also lives in edit mode,
so a first-time reader sees a plain table of facts and exactly one thing they can do to
change it.

This is why view mode has no grip column: a grip is the one piece of chrome whose only
purpose is to say "this moves". Leaving it in view mode advertised an interaction the
mode then refused, so the handle promised something the page would not do. With it
removed, the leftover width goes to the data columns instead of an empty 30px strip.

The single exception is an **empty tab**, where the header shows an **Add device**
button instead of **Edit all rows**. A tab with no rows has nothing to edit, so offering
only "Edit all rows" there would be a dead end.

**Edit mode** is for correcting, and it is where every mutating control lives. One
click on **Edit all rows** reveals: the per-row drag grips, the per-column drag grips,
the actions column with per-row Edit and Delete, a trailing row holding **Add a row**,
and a bar above the table holding **Add column**, **Add device**, **Discard** and
**Save all**. Every editing affordance appears together and disappears
together, so the page never mixes "you can change this" with "you cannot change this".

The reasoning is the same in both directions: the two "add" buttons sit at the end of
the grid because both mean "one more of the thing in this table", Add device opens a
form so it stays in the bar with the ways out of the mode, and per-row buttons belong
where you are already working on rows. Keeping the two adds together also removes the
coin-toss problem: there used to be a **Columns** button in the bar, a `+` in the header
row and a trailing row, which is three places to look for two actions.

#### Editing every row at once

Correcting a whole inventory one dialog at a time is slow, so **Edit all rows** turns
the visible sheet into a grid of inputs: every cell of every row on the current tab
becomes editable in place, and a bar above the table summarises the batch.

- The bar names the scope — `Editing N rows` — because Save covers **the rows on
  screen**, not the whole table. A user who searched or switched tab should never
  assume it reaches rows they cannot see. For the same reason only visible rows are
  collected, and only cells whose text actually differs from the stored value are
  sent: writing the whole sheet would stamp `updated_at` on untouched rows and could
  overwrite a concurrent edit.
- **Add device** stays in the bar and opens the usual form. Adding a device is a
  mutation, so it belongs with the other mutations rather than beside a read-only
  table. Because the form is a modal the batch state is untouched while you fill it in,
  so adding a device mid-edit does not discard anything you have typed.
- A live counter (`3 changed`, mirrored in `Save all (3)`) reads the inputs rather
  than a change log, so retyping the same text goes back to zero instead of looking
  like an edit.
- The search box is disabled while the grid is open; a control that silently does
  nothing is worse than one that visibly steps aside. (The trailing row is not
  hidden any more — it becomes the **Add a row** button.)
- Only one grid is rendered in this mode, not the usual desktop-table-plus-mobile-card
  pair: a hidden twin took part in Tab order and in the dirty count, so one real edit
  could read as two changes.
- **Dragging rows and columns, and adding a row, all work while editing.** The
  grid is one place to do everything: the column grips stay live in the header,
  the row grips stay live on the left, and the table's trailing row is an
  **Add a row** button that appends an empty editable row. An added row is tinted,
  counts as a change as soon as it has text, and its drag grip is deliberately
  inert (greyed, not-allowed cursor) because a row that has no id yet cannot be
  reordered — it is created on Save, not on click, so changing your mind leaves no
  junk behind. Reordering while editing re-sequences the stored rows immediately
  and keeps every typed value, so a move never costs you work.
- On a phone the grid **stacks into cards** instead of scrolling sideways. A 654px
  sheet in a 356px viewport clipped the name field to 111px and pushed each row's
  Edit/Delete buttons 240px off-screen with nothing to say so. Stacked, every field
  carries its small uppercase label (the header is off-screen on a phone, so the label
  is the only thing naming the value), the name input fills the card, and the row
  actions sit at the bottom behind a divider because they act on the whole card rather
  than on the field above them. It is the same markup and the same handlers — only the
  layout changes, and the desktop view is still a real table with its sticky header.
- `Enter` saves, `Escape` discards (asking first only when something would be lost),
  and `Tab` wraps from the last cell back to the first so the caret never leaves the
  sheet. A blank device name is caught in the browser and its cell highlighted, since
  that is the one thing the grid can produce that the API refuses.

The API side is `PATCH /api/devices/bulk` with `{ updates: [{ id, ...cells }] }`. It is
a convenience over the single-row route, not a different contract: every row is
validated exactly as a `PATCH /api/devices/:id` would be, and the whole batch is
rejected if any row is bad — a partial save would leave the sheet half-updated with no
way to tell which cells landed. Duplicate ids, more than 500 rows, and a missing `id`
are refused outright, and a blank name reports the offending row (`Device name is
required (row 12)`), because "Device name is required" alone is useless when twenty
rows are on screen.

While a row is dragged, three things are drawn: the row in hand is tinted with a
primary edge marker, a single T-shaped insertion marker appears in the gap the row
will occupy — a 4px horizontal bar plus a 4x15 vertical tick in the grip column — and
a small **DROP HERE** pill sits beside that bar. The pill is a real element, not a
pseudo-element: `is-drop-before` already spends both of a row's pseudo-elements on the
bar and the tick, and sharing `::before` applied the bar's `right: 96px` and gradient
rules to the label, stretching it into a second full-width bar. It is anchored inside
the target row rather than above it, because a pill hung above the first row painted
underneath the sticky header and was invisible exactly where a top-of-table drop
needed it.
The bar stops at the actions column instead of running the full table width, and a
first-row drop lifts the tick into the gap above the header line so "the very top"
cannot be read as "under the header". No marker is drawn when the drop would not
change the order (dropping a row on itself, or above/below its own position).

Three rules keep the marker from being a source of bugs. A pseudo-element is never
generated on the drop row beyond the two the bar needs: an extra `::after` on a
`display: table-row` makes the browser wrap it in an anonymous table cell, which adds
a phantom column and redistributes every width — measured as the header left edges
drifting 564/601/789/932/1070/1283/1317 to 564/601/789/931/1068/1280/1314 the instant
a marker appeared. Second, it must cost **zero
layout**: the bar is an inset `box-shadow` on the cells and the tick is an absolutely
positioned `::after` in a grip cell that is `position: relative` at all times, never
only during a drag. Making the drop row itself `position: relative` grew the table by
11px, which popped the scroll wrapper's vertical scrollbar, narrowed every column
(the last header moved 1331px → 1250px) and re-flowed the whole table under the
cursor — reported as "when you move slowly, suddenly name device changes to version,
version to root", and it also invalidated hit-testing so an upward drag landed a row
off. Third, the gap the marker lights is exactly the gap the row drops into, in both
directions: dragging up to the upper half of row 2 lands above row 2, dragging down to
the lower half of row 2 lands below it. Verified across ten drag paths with the
marker gap and the resulting index asserted against each other.

`dragover` fires on every pixel of movement, so the marker is treated as state: the
class is only touched when the target row or side actually changes, and the dragged
row's own class is set once at `dragstart` and cleared once at `dragend`. Mutating the
drag source during `dragover` made Chromium abandon the gesture — `drop` never fired,
`dragend` reported `dropEffect: 'none'`, and the reorder was silently discarded for
roughly one drag in three. As a second line of defence, `dragend` commits whatever
move the on-screen marker was already promising when no `drop` arrived, because the
marker is a visible statement of intent and honouring it is better than losing the
gesture.

Rows can be reordered by dragging the grip in the leftmost column, or with the
arrow buttons in the same column for keyboard and touch use; the order is stored in
`devices.position` (`0` means "never reordered", so a freshly seeded type still
falls back to alphabetical). The table scrolls horizontally inside its own wrapper
rather than widening the page, and the scroll edge is faded so the last partially
visible column reads as "there is more" instead of as clipping.

The **Columns** editor caps its list at roughly eight rows so a long layout cannot
push the Save button off screen. When there is more below, a dashed **Show more
columns (N more)** button appears under the list; it disappears at the end, and a
newly added column auto-scrolls into view so pressing *Add column* visibly does
something.

**Fields a type does not own are dropped, not stored.** Posting
`{"kind":"Android","serial":"…"}` returns a device with no `serial`, and switching
an existing row from Android to Misc wipes `version` and `rom`. This is what keeps
the data honest: a field could otherwise sit on a row that never renders it and
then reappear, looking like corruption, if the type were changed back.

Type names are `Android`, `iOS`, `EDC`, `Misc` — note the lowercase `i` in `iOS`,
which is how the type is spelled everywhere (label and value alike).

Search matches every column of the visible table, plus the name and the person, so
typing a ROM string or a serial finds the device. The per-tab counts come from
their own query, so they keep showing the true total for each type even while a
search filters the visible list down to nothing.

At ≤760px the table becomes one card per device with a labelled field list, because
a nine-column sheet cannot be read on a phone by scrolling sideways.

### Project fields
| Field    | Values                                                    |
| -------- | --------------------------------------------------------- |
| Name     | free text, required                                       |
| Client   | **searchable dropdown** — type to filter the client catalogue |
| Application | **searchable dropdown** — only the apps that belong to the chosen client |
| Category | from the property list — `Web` · `Mobile` · `API` · `EDC` out of the box, editable in **Admin panel → Properties** |
| Platform | `Android` · `iOS` · `API` (mobile backend) — **only for Category = Mobile** |
| Env      | `Dev` (default) · `Prod`                                  |
| Method   | `Black Box` · `Grey Box` (default) · `White Box`          |
| Status   | from the property list — `Incoming` · `Ready` · `Ongoing` · `Done` · `Hold` out of the box, editable in **Admin panel → Properties** |
| Start date | date — **not asked on create**; stamped with today the first time the project moves to `Ongoing`; editable afterwards |
| End date | date — **not asked on create**; stamped with today when it moves to `Done`; cleared again if it is re-opened |
| Project manager | **one PM** — searchable dropdown of `Project Manager` users. **Auto-selected** from the chosen client's default PMs; still editable |
| Who pentest | **multiple** pentesters, picker **with a name search box** |
| Notes    | free text (scope, creds location, out-of-scope)           |

Defaults on create: `Dev` / `Grey Box` / `Incoming` / `Web`.

### Manage users (Admin panel)
**Admin panel → Manage users** is the one page for every account: the pentest
tree on top, the project managers below, and a tab when you only want one of them.

The two used to be separate pages. They were built on the same `users` table, the
same create path and the same question — *who works here?* — so adding a person
began with a guess about which page they belonged on, and the two pages drifted into
different copy for the same account. One page, one **New user** form (pick the
role and the fields follow) and one **Import** now cover both.

Everything on that page is a `users` row with a `role` of `Pentester` or
`Project Manager`; the difference is what the role owns. A pentester joins the
reporting tree below. A project manager sits outside it and owns engagements.

Both roles carry the same **contact details** — a phone number and an e-mail — and
both are set in the same place: **Edit** (the pencil) on the person's row. They are
then printed on the row itself (and on the person card you get by clicking the
avatar), because a field nobody can see from the list reads as a field that does not
exist. On a member row the contact line is the first thing to go below 1100px, where
the name, level, project count and two buttons already fill the line.

#### Pentester hierarchy

Pentesters are organised in a strict three-level reporting tree:

```
Lead
  └── Sub Lead        (reports to a Lead)
        └── Member    (reports to a Sub Lead)
```

Open **Admin panel → Manage users** to see the tree, add people under a branch,
move someone to a different manager, or remove them. The reporting line is stored
as `users.parent_id`, and the server enforces the rules:

- a `Lead` cannot have a parent
- a `Sub Lead` must report to a `Lead`
- a `Member` must report to a `Sub Lead`
- nobody can report to themselves, and reporting loops are rejected
- a manager who still has people under them cannot be deleted (the API returns
  `409` and names how many reports must be moved first)

#### Importing a team

Adding nineteen people one modal at a time is not a thing anyone does, so the page
carries an **Import** button. It takes a pasted list or a file (`.csv`, `.tsv`, `.txt`)
and shows every parsed row **before** anything is written.

**Only the full name is required.** Everything else is optional, and is recognised by
*shape* rather than by column position, because a team list arrives from a spreadsheet
as often as from a chat message:

| # | Field | Behaviour |
| --- | --- | --- |
| 1 | Full name | required |
| 2 | Username | else `first.last` from the name; `.2`, `.3` appended when already taken |
| 3 | Password | else the dialog's default — `pentester123` / `manager123` per role |
| — | Phone / e-mail | recognised **by shape, anywhere on the line**: any cell containing `@` is the address (and is validated — `rina@bank` is rejected rather than silently becoming a username), a cell of six or more digits is the phone. Both are stored on the account and printed on the person's row |
| 4 | Level | `Lead`, `Sub Lead` or `Member`, picked up **wherever it appears** |
| 5 | Reports to | name or username of the parent; blank means "the nearest legal parent" |

All four of these parse to the same person:

```
Dewi Lestari
Dewi Lestari, Sub Lead
Dewi Lestari, dewi, pentester123, Sub Lead, Rafi Pratama
Dewi Lestari, +62 812 0000 0000, dewi@onepromag.id
```

The preview shows a **Contact** column per row, so what will be stored as the phone and
e-mail is visible before anything is written — a paste that silently dropped them would
otherwise look identical to one that carried them.

Rows are created in listed order, so a file can build its own tree: a `Lead` first,
then the `Sub Lead`s that report to them, then the members. A row that cannot be
created — a taken username, a password under six characters, a member with no sub lead
above them in the file — is marked in the preview and skipped rather than fatal: the
import runs one request per row, and the dialog is left holding only the lines that
failed, so the fix is an edit rather than a rewrite from memory.

Only admins, leads and sub leads can open the admin panel.

**Client is not free text.** It is a `<select>` fed from the client catalogue,
so the list stays clean and consistent. Choosing a client narrows the
**Application** dropdown to that client's own applications — the server rejects
any mismatched pair, so a project can never point at someone else's app.

When **Category = Mobile**, a **Mobile platform** control appears with
`Android`, `iOS` and `API` (a mobile backend). Switching away from Mobile clears
it, so web/EDC projects never carry a stale platform.

**Who pentest** is a picker listing every pentester sorted by hierarchy, each
row showing their level pill. A search box above it filters by name; your
selection survives filtering because rows are hidden rather than re-rendered.

### Team status board
**Team status** is the first item in the sidebar's Workspace group, above Active
projects. The board answers one question: **who is busy and who is idle right
now?**

| Column | Meaning |
| --- | --- |
| Pentester | Avatar, name and level pill |
| Status | On Project · Idle · Leave · Exam · Research/Learning · Other |
| Assigned project / current doing | **Every** project they are currently on, as chips (no "+N more" truncation — this is the widest column and long names wrap); each chip opens the project, and the row carries a quick **Assign project** button |
| Idle since | While idle: number of days plus the date they last finished something. Someone who has never closed a project starts counting from today, since there is no evidence of an earlier idle start |
| Notes | Free text, editable in place |

Rows follow the reporting tree — a lead, then that lead's sub lead with its
members, then the next sub lead, and so on.

On a phone the five columns cannot fit, so each row becomes a **stacked card**:
the table header is hidden, the person and status share the first line, and the
remaining fields appear below under small uppercase labels (`DOING`,
`IDLE SINCE`, `NOTES`). Fields with no value are omitted rather than showing a
dash, and nothing scrolls sideways.

**Automatic status.** `On Project` and `Idle` are derived on the **server**, on
every read, from the real assignment table:

- `On Project` — the pentester sits on at least one project whose status is not `Done`
- `Idle` — every project they are on is `Done`, or they are on nothing

Both update themselves the moment a project or a retest moves to `Done`, so the
board never drifts from the project list. Derived statuses carry a small `auto`
marker so they can be told apart from a manual one.

**Manual status.** `Leave`, `Exam`, `Research/Learning` and `Other` are stored on
the user row and override the automatic value until cleared with *Back to
automatic*. Use them for things the project data cannot know.

**Permissions.** Admin, Lead and Sub Lead may set the status and the note for
**anybody**. A Member may only change **their own row** — enforced in the API
(`403 You can only change your own availability`), not just hidden in the UI.

**Totals.** The four cards above the table show how many people are on a
project, how many are idle together with the **total idle days** across the
team, how many are unavailable, and the team size. `idle_since` is the newest
`ended_at` among a person's projects, falling back to their retests.

### Properties (Admin panel)
**Admin panel → Properties** is the CRUD page for the two lists every project is
filed under: **categories** and **statuses**.

They used to be two hard-coded arrays, one copy in the client and one on the server.
They are rows now, which is what lets an admin add *Cloud* as a category or rename
*Ongoing* to *In progress* without a deploy.

The page has one table per kind — **Label · Stored key · Looks like** — with reorder
arrows, edit and delete:

- **Label** is the word every badge, picker and filter prints.
- **Stored key** is what `projects.category` / `projects.status` actually contain.
  It is never editable: renaming is a display change, so projects keep their place
  and nothing has to be migrated. The edit dialog says which key you are renaming.
- **Looks like** is the live badge. The colour picker in the dialog is made of the
  badges themselves, so the choice is made by looking at it.
- **Order** is the order of the project form, the quick-status menu and the filters.

The nine seeded rows are marked **built in** and cannot be deleted — the code
compares against those keys (`'Done'` is what makes a project finished, `'Mobile'`
is the only category that owns the platform field, open retests count statuses
`'Incoming'`/`'Ongoing'`). Their label, colour and order are fully editable. A
property an admin adds is ordinary and can be deleted as soon as nothing uses it;
deleting one that is still in use is refused with the count, the same rule as
deleting a client or a project manager.

### Clients & applications (catalogue)
Each client owns a list of applications — for example *Bank Nusantara* owns
*Qitta*, *Brimo*, *Brilink* and *Nusantara Corporate Portal*. Manage them from
**Admin panel → Clients & apps**:

- create, rename and delete clients
- add, edit and remove applications per client
- see how many projects use each client, and each app's project count
- deleting a client or app still in use is refused with a clear message, so
  project history is never silently orphaned

Only **Admin**, **Lead** and **Sub Lead** see and can use the Admin panel.

#### Project managers (same page)
The **Project managers** half of that page manages the `Project Manager` role.

A project has **exactly one** project manager (`projects.manager_id`). A client
can name **several** default PMs (`client_managers`, a many-to-many join), which
is what drives auto-selection:

- Open **New project**, choose a client, and the PM dropdown is filled in for you.
- A client with **one** default PM selects that PM and says so in the hint.
- A client with **several** selects the first, and the hint turns amber and names
  the count so it is obvious a choice was involved — never a silent pick.
- A client with **none** leaves the field empty and says so.
- The value is always editable, and **editing an existing project never
  re-triggers the auto-pick**: touching the client on an existing engagement must
  not silently reassign its owner.

The manager page lists every PM with contact details and the clients they are the
default for. Deleting a PM that still owns projects is refused server-side
(`Cannot delete: N project(s) are still owned by this manager. Reassign them first.`)
with the same warning surfaced in the confirmation dialog before the request.

On the project list the PM appears in its own **PM** column, immediately left of
**Pentesters**, and as a tagged `PM` line on each card. The column shows only the
manager's avatar — the name is on the tooltip, because a clickable face identifies a
person faster than a repeated full name, and it keeps the row narrow.

### People
Any avatar of a **Project Manager** or a **Pentester** is a button — in the table, on
a card, in the drawer, and on the team status board. Clicking one opens a person card:

- name, level and role, `@username`, and current availability (with the `auto` marker
  when the status is derived rather than set by hand);
- phone and e-mail as `tel:` / `mailto:` links;
- their availability note, when they have one;
- **Project manager for** — every engagement they own, as a chip (hidden when they
  own none, and for pentesters who are not PMs);
- **Pentesting** — every project they are assigned to, with `N active · M done`
  (omitted entirely for a PM, who does not sit on the test bench);
- **Reporting to this person** — their direct reports in the hierarchy.

Clicking a project chip closes the person card and opens that project, so you are
never stacked two dialogs deep. The card is a read-only view; the API behind it is
`GET /api/people/:id`.

The avatar is a 24px disc, well under the 44px minimum touch target, so each one
carries a transparent `::after` that opens the hit area to 44px without moving any
layout. Inside a stacked group of avatars that area grows **vertically only** — a
full 44px circle would sit on top of the neighbouring face and steal its tap, so the
avatar you hit is always the one under your finger.

### Retests (client request queue)
A retest is **not a per-finding record** — it is a **client request to test again**.
Raising one **queues the project**: if the project was already `Done` it flips back
to `Ongoing`, which puts it back in **Active projects** (and it is labelled
`Retest - <name>` there) until the retest is closed.

A project can carry **unlimited retests**, each with:
- auto code (`RT-007-01`, `RT-007-02`, …) derived from the highest existing sequence,
  so deleting one never causes a duplicate
- a name taken from the project (`Retest of <project>`) — a retest is a re-verification
  of that project, so it is not given a free-text title
- request date
- its own status (`Incoming` / `Ready` / `Ongoing` / `Done` / `Hold`)
- **start and end dates**, under exactly the same rules as a project: not asked
  when the request is created, stamped with today on the move to `Ongoing` and
  `Done`, and editable in the retest form afterwards
- notes

A retest does not ask who requested it — it is a **client** request, not something
the signed-in user is asking for.

Create, edit and delete them from the project drawer → **Retests** tab. Projects
show a retest count badge, and any `Incoming`/`Ongoing` retest counts as open
(highlighted in the sidebar and stat cards).

---

## Database

PostgreSQL is the default because the data is inherently relational
(`projects` ↔ `users` many-to-many, `projects` → `retests` one-to-many) and the
dashboard aggregates counts per project on every list request.

| | PostgreSQL (default) | SQLite (fallback) |
| --- | --- | --- |
| Storage | `onepromag-pgdata` volume | `onepromag-data` volume |
| Services | app + `db` | app only |
| Multiple app instances | ✅ | ❌ (shared volume corrupts) |
| Concurrent writers | ✅ row locks | single writer, serialised |
| Backup | `pg_dump` | `VACUUM INTO` |
| Setup | `docker compose up --build` | `DB=sqlite ... up --build onepromag` |

`devices` is the one table whose columns are the union of four different field
sets rather than a per-kind table — see [Devices](#devices) for why the API drops
fields a kind does not own. `devices.extra` is `TEXT NOT NULL DEFAULT '{}'` and
holds the values of user-added columns; `devices.position` is the dragged row
order, defaulting to `0` so a never-reordered table keeps its alphabetical sort.
`device_columns(kind, key, label, position, hidden, builtin)` is the saved layout
per type, seeded from `DEVICE_FIELDS` on first read.

Both engines run the **same SQL** through `server/drivers/`. Application code
always writes `?` placeholders; the Postgres driver rewrites them to `$1..$n`.

### Schema

`users.availability` and `users.availability_note` hold the manual status;
both default to `''`, which means *automatic*. The On Project / Idle value is
never stored — it is computed from `project_pentesters` + `projects.status` on
every request, which is why the board cannot go stale.

`users.phone` and `users.email` are plain `TEXT NOT NULL DEFAULT ''` — not
unique, not validated beyond the obvious, because the source of truth for a
person's contact details is HR, not this app.

`projects.manager_id` is `INTEGER REFERENCES users(id) ON DELETE SET NULL`:
exactly one PM per project, and deleting a PM cannot orphan-project the row
(the delete is separately refused while any project still points at it).
`client_managers(client_id, user_id)` is the many-to-many of a client's default
PMs. Every one of these columns is added by `addColumnIfMissing()` in both
migration paths (the `v1.6` block), so an existing database upgrades in place.

`documents` is keyed by `(scope, scope_id, env)` — the same client/application
pairing `info_entries` uses, plus which environment the sheet describes — and holds
`text_body` plus `table_json` (the identical JSON grid shape as
`info_entries.data`, so one parser serves both). `updated_by` is `ON DELETE SET
NULL`: the document outlives the person who last edited it. Saving is a single
upsert, so a first save and a later one take the same code path.

`info_entries.env` follows the same idea one column over: a note records which
sheet it was written on, added by `addColumnIfMissing('info_entries','env',...)` in
the `v1.11` block of both migrations. Unlike `documents` there is no primary-key
change involved — notes are identified by their own `id` — so the plain
`ADD COLUMN` suffices and existing notes default to `Dev`, which is exactly where
they were displayed before the column existed.

`env` is added by `addColumnIfMissing('documents','env',...)` in the `v1.10` block
of both migrations. Widening a **primary key** cannot be done with
`CREATE TABLE IF NOT EXISTS` or `ADD COLUMN`, so `migrateDocumentsKey()` rebuilds
the table once on installs that predate the column: it renames the old table,
creates the new `(scope, scope_id, env)` key, copies every existing row over as
`Dev`, and drops the old one. It is guarded by a check on the current key columns,
so it is a no-op afterwards, and on Postgres it is a `DROP CONSTRAINT` /
`ADD PRIMARY KEY` pair instead of a rebuild.

`schema/sqlite.sql` and `schema/postgres.sql` are kept in lockstep — same tables,
same ISO-8601 `TEXT` timestamps (no `timestamptz`), so the JSON API is identical
on both. Applying is idempotent (`CREATE ... IF NOT EXISTS`) and runs on every boot.

### Retest code generation
`RT-<project>-<seq>` is computed from the **highest existing sequence** for that
project, not `COUNT(*)` (counting repeats a code as soon as one is deleted).
Generation happens inside a transaction with the project row locked
(`SELECT ... FOR UPDATE` on Postgres, `BEGIN IMMEDIATE` on SQLite), and
`UNIQUE (project_id, code)` is the backstop. Verified with 40 concurrent creates
on each engine: 40 distinct codes, zero duplicates, zero errors.

### Backups

```bash
# Postgres — consistent dump
docker exec onepromag-db pg_dump -U onepromag onepromag > backup-$(date +%F).sql

# SQLite — safe online snapshot (WAL-aware; do not cp the file while running)
docker exec onepromag node -e "
  const {DatabaseSync} = require('node:sqlite');
  new DatabaseSync('/data/app.db').exec(\"VACUUM INTO '/data/backup-' + Date.now() + '.db'\");
"
```

### Migrating existing SQLite data to Postgres

Start the stack on Postgres, log in, and re-create the records — or script the
copy with `pg_dump`-friendly inserts. Because both schemas share column names,
a row-for-row copy is all that is required; there are no type conversions unless
you switch the timestamp columns to `timestamptz`.

---

## Project structure

```
OneProMag/
├── Dockerfile
├── docker-compose.yml       development: publishes 3131, no TLS
├── docker-compose.prod.yml  deployment: Caddy + TLS, nothing else published
├── deploy/
│   ├── Caddyfile            TLS, compression, security headers, access log
│   └── .env.example         template for the production .env
├── .dockerignore
├── .gitignore
├── package.json
├── server/
│   ├── index.js         HTTP server, routing, static files, boot sequence
│   ├── db.js            engine selection, schema apply, seed data
│   ├── auth.js          scrypt hashing, sessions, user CRUD
│   ├── api.js           REST handlers + validation
│   ├── schema/
│   │   ├── sqlite.sql
│   │   └── postgres.sql
│   └── drivers/
│       ├── shared.js    placeholder rewriting, transaction lock
│       ├── sqlite.js    node:sqlite adapter
│       └── postgres.js  pg Pool adapter
├── public/
│   ├── index.html
│   ├── css/styles.css   design tokens, components, responsive
│   └── js/
│       ├── app.js       views, state, interactions, admin panel
│       ├── api.js       fetch wrapper
│       ├── ui.js        modal/toast/badge/segmented primitives, team + PM cell
│       ├── props.js     categories/statuses registry (filled at boot)
│       └── icons.js     inline SVG icon set, platform/subrole maps
├── backups/             created when the backup profile runs (git-ignored)
└── data/app.db          only created in SQLite mode
```

## API

All endpoints except `/api/auth/*` require a session cookie.

`POST /api/auth/password` takes `{ currentPassword, newPassword }`. It answers
`400` for a wrong current password, a password under 6 characters, or a new
password identical to the old one, and `200 {ok:true}` otherwise — revoking every
other session for that user so a stolen cookie dies with the old password.

| Method | Path                        | Purpose                          |
| ------ | --------------------------- | -------------------------------- |
| POST   | `/api/auth/login`           | sign in with a username **or** an email |
| POST   | `/api/auth/register`        | self-register (always Member)    |
| POST   | `/api/auth/logout`          | destroy session                  |
| GET    | `/api/auth/me`              | current user (or `null`)         |
| POST   | `/api/auth/password`        | change own password              |
| PATCH  | `/api/auth/profile`         | change **own** phone + email; role, level and name are not accepted |
| GET    | `/api/docs/:scope/:scopeId?env=` | the fixed text + table document for a target and environment (`env` is `Dev` by default); an empty one if never saved |
| PATCH  | `/api/docs/:scope/:scopeId` | save either half (`text` and/or `table`) for `env`; the omitted half is untouched |
| GET    | `/api/info?scope=&scopeId=&env=` | notes for a client / application **on one sheet** (`env` defaults to `Dev`; a client only ever has Dev) |
| GET    | `/api/info/search?q=`       | search every note (title, body, category, table cells); ≥2 chars |
| POST   | `/api/info`                 | add a note; `env` files it on the Dev or Prod sheet |
| PATCH  | `/api/info/:id`             | edit or pin a note; `env` moves it between sheets |
| DELETE | `/api/info/:id`             | delete a note                    |
| GET    | `/api/devices?kind=&q=`     | device inventory; returns `devices`, per-kind `counts`, `columns` (the saved layout per type), `fields`, `labels`, `kinds` |
| PATCH  | `/api/devices/columns/:kind`| replace one type's column layout (`key`, `label`, `hidden`, `builtin`) |
| PATCH  | `/api/devices/order`        | `{kind, ids}` — persist a dragged row order into `position` |
| POST   | `/api/devices`              | add a device — fields the kind does not own are ignored |
| PATCH  | `/api/devices/:id`          | update; changing `kind` drops the old kind's fields |
| PATCH  | `/api/devices/bulk`         | `{updates:[{id,...cells}]}` — save many rows at once; all-or-nothing, max 500, rejects duplicate ids |
| DELETE | `/api/devices/:id`          | delete a device                  |
| GET    | `/api/users`                | list pentesters (sorted by hierarchy), PMs excluded |
| GET    | `/api/directory`            | the staff directory: every account, name · role · level · e-mail · phone, alphabetical |
| GET    | `/api/people/:id`           | one person + `managerOf`, `pentesterOn`, `reports` |
| GET    | `/api/managers`             | list project managers |
| POST   | `/api/managers`             | add a PM: `{ username, name, password, phone, email }` |
| PATCH  | `/api/managers/:id`         | rename / update `{ name, phone, email }` |
| DELETE | `/api/managers/:id`         | remove (409 while they still own projects) |
| GET    | `/api/stats`                | dashboard counters + clients/apps; `mineActive`/`mineAll` mirror `?mine=1` |
| GET    | `/healthz`                  | readiness: process up **and** a database round trip; `503` + `{ok:false,db:"down"}` when Postgres is unreachable |
| GET    | `/api/properties`           | project categories + statuses (`key`, `label`, `tone`, `position`, `locked`) |
| POST   | `/api/properties/:kind`     | add a property (`category` \| `status`): `{ label, tone }` — the key is derived |
| PATCH  | `/api/properties/:kind/:id` | rename / recolour / reposition one property |
| PATCH  | `/api/properties/order`     | `{ kind, ids }` — persist a reordered list |
| DELETE | `/api/properties/:kind/:id` | remove (409 when built in, or while projects/retests still use it) |
| GET    | `/api/projects`             | list + filter (`q`, `clientId`, `applicationId`, `status`, `category`, `env`, `method`, `mine`, `pentester`, `queue`, `activeOnly`, `finishedOnly`, `excludeStatus`, `inStatus`) — `queue` and `finishedOnly` no longer have a sidebar page, but the API keeps them |
| GET    | `/api/availability`         | team board: status, current projects, idle-since, totals |
| PATCH  | `/api/availability/:id`     | set `{ status, note }`; members may only patch themselves |
| POST   | `/api/projects/:id/pentesters` | quick-assign from the board: `{ userId }`; admin/lead/sub lead only |
| DELETE | `/api/projects/:id/pentesters/:userId` | remove a pentester from a project from the board |
| GET    | `/api/pentesters`           | flat list + nested `tree` (Lead → Sub Lead → Member) |
| POST   | `/api/pentesters`           | add a pentester (parent validated against the level) |
| PATCH  | `/api/pentesters/:id`       | rename, change level, or re-parent |
| DELETE | `/api/pentesters/:id`       | remove (blocked while they still manage someone) |
| POST   | `/api/projects`             | create project                   |
| GET    | `/api/projects/:id`         | project detail + its retests     |
| PATCH  | `/api/projects/:id`         | update project                   |
| DELETE | `/api/projects/:id`         | delete project (+ cascade retests) |
| POST   | `/api/projects/:id/retests` | add retest request               |
| PATCH  | `/api/retests/:id`          | update retest                    |
| DELETE | `/api/retests/:id`          | delete retest                    |
| GET    | `/api/clients`              | list clients                     |
| POST   | `/api/clients`              | create client (Admin/Lead/Sub Lead); `{ managerIds: [] }` sets default PMs |
| PATCH  | `/api/clients/:id`          | rename / edit client, incl. `managerIds` |
| DELETE | `/api/clients/:id`          | delete client (409 while in use) |
| GET    | `/api/applications`         | list applications                |
| POST   | `/api/applications`         | create application               |
| PATCH  | `/api/applications/:id`     | edit application                 |
| DELETE | `/api/applications/:id`     | delete application (409 while in use) |

Search is case-insensitive on **both** engines (`LOWER()` on both sides —
PostgreSQL's `LIKE` is case-sensitive by default, SQLite's is not).

## Design notes

- **Design tokens** — every color, radius, shadow and font is a CSS variable in
  `public/css/styles.css`; `[data-theme="dark"]` redefines the palette.
- **Contrast** — all text meets WCAG AA (≥4.5:1) against its own surface in both themes.
- **Typography** — Inter with a tight tracking scale for headings; JetBrains Mono for
  retest codes; `tabular-nums` for counters.
- **Accessibility** — semantic buttons, `aria-label`s on icon-only controls, visible
  `:focus-visible` rings, `prefers-reduced-motion` support, Escape closes modals/drawer.
- **Responsive** — card grid reflows to 1 column, sidebar becomes a slide-over drawer,
  forms collapse to a single column below 620px.
- **Security** — all user text is HTML-escaped on render; SQL uses prepared statements;
  passwords are `scrypt`-hashed; cookies are `HttpOnly`; app runs as non-root in Docker.

## Requirements

- **Docker** with Compose v2 (`docker compose ...`) — nothing else, for the Docker path
- **Node.js ≥ 22.5** and `npm install` — only for the non-Docker path

## Configuration

| Variable       | Default      | Meaning                                          |
| -------------- | ------------ | ------------------------------------------------ |
| `DB`           | auto         | `postgres` or `sqlite`; overrides detection      |
| `PORT`         | `3131`       | HTTP port inside the container / process          |
| `HOST`         | `0.0.0.0`    | bind address                                     |
| `DATABASE_URL` | —            | full Postgres connection string; implies Postgres |
| `PGHOST`       | `localhost`  | Postgres host (`db` inside compose)               |
| `PGPORT`       | `5432`       | Postgres port                                     |
| `PGUSER`       | `onepromag`  | Postgres user                                     |
| `PGPASSWORD`   | —            | Postgres password                                 |
| `PGDATABASE`   | `onepromag`  | Postgres database                                 |
| `DATA_DIR`     | `./data`     | SQLite file location (`/data` inside the image)   |
| `APP_PORT`     | `3131`       | *compose only* — host port to publish             |
| `TZ`           | `Asia/Jakarta` | timezone inside the container. A container defaults to **UTC**, so without this the automatic start/end date stamps would record the wrong day. Set your own zone, e.g. `TZ=Europe/Amsterdam`. |
| `ONEPROMAG_SUBNET` | `10.77.0.0/24` | *compose only* — Docker subnet for the app network |
| `COOKIE_SECURE` | `0` | set `1` to add `Secure` to the session cookie — required once the app is served over https (the prod compose file sets it). A `Secure` cookie set over `http://` is dropped by the browser, so a LAN install must leave it `0`. |
| `POSTGRES_PASSWORD` | `onepromag` (dev) | *compose only* — **required** by `docker-compose.prod.yml` |
| `HOST_UID` / `HOST_GID` | `0` | *compose only* — owner of the files the backup container writes to `./backups` |

`docker compose up --build` starts both services, so Postgres is what you get out
of the box. Override the database password for anything beyond local use:

```bash
POSTGRES_PASSWORD=$(openssl rand -base64 24) docker compose up --build
```

## Troubleshooting

- **`all predefined address pools have been fully subnetted`** — this host has
  exhausted Docker's address pool. The compose file pins an explicit subnet
  (`10.77.0.0/24`) on a user-defined network to avoid the pool; override with
  `ONEPROMAG_SUBNET` if it collides with your LAN.
- **`Port 3131 is already in use`** — use `APP_PORT=8080 docker compose up --build`.
- **App container restarts, `waiting for postgres`** — the app retries the
  connection for ~30s. Check `docker compose logs db`; if the password volume was
  initialised with a different password, run `docker compose down -v` to reset.
- **`ExperimentalWarning: SQLite is an experimental feature`** — only appears in
  SQLite mode on Node 22. The image uses Node 24 where `node:sqlite` is stable.
