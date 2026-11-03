# Tasks

## `harden-api`

- [x] **R3 — one writer at a time on SQLite**
  - Acceptance: `run()` holds the same lock as `transaction()` and joins an open transaction instead of starting a nested one; `PRAGMA busy_timeout` is set on connect.
  - Verify: `npm test` green; new test starts two overlapping transactions and asserts neither throws `SQLITE_BUSY`; `PRAGMA busy_timeout` reads back non-zero.
  - Files: `server/drivers/sqlite.js`, `server/schema/sqlite.sql`, `test/api.test.js`

- [x] **R12 — index what is queried, delete what is not**
  - Acceptance: indexes on `project_pentesters(user_id)`, `retests(project_id, status)`, `sessions(expires_at)` exist after boot on both engines; `expireSessions()` deletes expired rows and runs on boot plus an `unref()`d hourly timer.
  - Verify: `npm test` green; new test inserts an expired session, calls `expireSessions()`, asserts the row is gone and a live row is not; index names present via `sqlite_master`.
  - Files: `server/db.js`, `server/auth.js`, `server/index.js`, `server/schema/*.sql`, `test/api.test.js`

- [x] **R1 — make guessing expensive, not impossible**
  - Acceptance: after 5 failed attempts for one identifier, each further attempt is delayed (400ms doubling, capped 2s) and the response carries `Retry-After`; a wrong password still returns 401, never a different status; the correct password still works; a different identifier is unaffected; a success clears the counter for that identifier only.
  - Verify: `npm test` green; new test drives 8 failures and asserts the delay grows monotonically and the correct password still logs in.
  - Files: `server/auth.js`, `server/index.js`, `test/api.test.js`

- [x] **R2 — the browser is told what it may do**
  - Acceptance: every `/api/*` response and every static asset carries `Content-Security-Policy` (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`.
  - Verify: `npm test` green; live browser loads every page with zero CSP violations in the console, both themes.
  - Files: `server/index.js`, `test/api.test.js`

## `split-app-js`

Done as one commit, not eleven. The plan called for a commit per module so each was
revertible on its own; that was the right shape for hand editing and the wrong shape
for this. The move was generated, then proved: every one of the 252 declarations was
found in exactly one module, no line of code was lost or duplicated (a line-histogram
of the original against the split closes to ±3 lines, all of them the `boot` banner
that moved into `shell.js`), `node --check` passes on all 17 files, and the app boots
in the container and runs every page with zero console errors. There is no
intermediate state worth bisecting to: the tree went from one file to seventeen with
no behaviour change in between.

- [x] **S1** `state.js` + `shared.js` — foundation, pure code motion
- [x] **S2** `properties.js`
- [x] **S3** `directory.js`
- [x] **S4** `admin.js`
- [x] **S5** `info.js`
- [x] **S6** `devices.js`
- [x] **S7** `team.js`
- [x] **S8** `users.js` — 1305 lines; the import wizard stayed with it, a fourth file for one wizard is not worth the indirection
- [x] **S9** `projects.js`
- [x] **S10** `drawer.js`
- [x] **S11** `auth.js` + `shell.js`; `app.js` reduced to a 20-line entry point

Verified as a whole rather than per module: `npm test` 40/40, live container md5 equal
to local for all 17 files, 11 pages as admin and 8 as a member, drawer with all three
tabs, new/edit/delete sub app, a retest raised and deleted, bulk edit and device modal,
directory search, board filter, light/dark, 430px with no overflow, zero console and
zero `window.onerror` entries throughout.

### Two bugs the completeness check caught (both would have shipped silently)

1. `shellHTML()` died with `ReferenceError: icon is not defined` — the import generator
   subtracted object-literal keys *per name, module-wide*, so one `{ icon: 'layers' }` in
   the stats array deleted the `icon` import for the whole file. The rule is positional:
   a name is a key only where it is followed by `:` and preceded by `{` or `,`.
2. Every template call site died with `ReferenceError: h is not defined` — the monolith
   imported `escapeHtml` as `h`, and the generator had no concept of a rename. Alias
   imports have to be reproduced as `escapeHtml as h`, not looked up as a local name.

## `csp-inline-styles`

The last thing keeping `style-src 'unsafe-inline'` in the policy, and the reason the
split had to land first: 38 `style="…"` attributes spread over five modules are
local edits once each module is its own file, and an unscoped search-and-replace
across one 9k-line file is how a "small cleanup" breaks the app.

- [x] **Inventory** — 38 attributes: `auth.js` 11, `drawer.js` 17, `projects.js` 5,
  `ui.js` 5, `shell.js` 1; `public/index.html` clean. No `<style>` injection, no
  `cssText`, no `setAttribute('style', …)`.
- [x] **Static values become classes** — 33 sites. New helpers at the end of
  `public/css/styles.css`: `.mt-0/2/12/14/20`, `.ml-auto`, `.flex-1`, `.min-0`,
  `.flex-row`, `.inline-flex`, `.faint`, `.auth-submit`, `.note-line`, `.note-count`,
  `.note-updated`, `.hint-block`, `.confirm-text`, `.retest-note`, `.pick-readonly`,
  `.empty-bare`, `.is-prod`.
- [x] **Runtime values become data attributes** — 5 sites, each drawing from a closed
  set: `.cat-icon[data-cat]` / `.pcard[data-cat]` (category palette, falling back to
  slate for a category an admin added), `.stat[data-accent]`, `.retest[data-tone]`,
  `.badge-outline.is-prod`. This is the pattern `.badge[data-tone]` already used.
- [x] **CSP tightened** — `server/security.js` drops `'unsafe-inline'` from
  `style-src`; the test asserts it stays out (`style-src must not allow inline: no
  markup carries a style= attribute`).
- [x] **Verify** — 40/40 tests; live container md5 equal to local; no CSP violations
  and no console errors on 11 pages, both themes, 430px.

### Why the verification is a computed-style dump

Screenshots could not answer the question. The app animates, and the drawer footer
prints a relative timestamp that re-renders every minute, so **two captures of an
unchanged build already differ** (measured: 13 of 16 states). A pixel diff would have
reported regressions that were not there.

The check that works: walk the DOM, key every element by its tree path (the change
only added classes and removed `style=` attributes, so the shape is identical), and
record ~22 computed properties per element. Diff the two builds state by state.

Result: **16 states, identical element counts, zero property differences** outside the
two categories that are pure capture noise — the sidebar's `active` highlight (which
depends on the page the script visited last) and the drawer footer's timestamp width.

### One real regression, caught by that dump

`.flex-1` was written as `flex: 1 1 0%; min-width: 0`. The theme buttons in the account
panel had only ever set `flex: 1`, and a zero minimum width lets a flex item shrink
below its own label. Split into `.flex-1` and a separate `.min-0` modifier that only
the modal head (which truncates on purpose) uses.

### Dead code deleted

`.mt-9`, `.block` and `.muted` were written for sites that ended up not needing them.
Removed rather than shipped: a helper class nobody uses is a class the next person
copies.

## `updated-at`

R6 from the four-axis review was "audit the `updated_at` call sites" — an audit, not a
fix, because nobody knew yet whether anything was wrong. The audit found three defects
and two things that only look like defects. Full reasoning in `docs/SPEC-updated-at.md`.

- [x] **The rule, named once** — `editStamp(row, next)` compares the exact columns the
  statement writes and returns `nowISO()` only when something really differs. `next` is
  keyed by DB column, and the `UPDATE` now builds its `SET` list from those same keys, so
  the comparison and the write cannot drift apart. `PATCH /api/info/:id`'s inline
  `contentChanged` block was the one correct implementation in the codebase; it now calls
  the helper, which is what D1 and D2 could not reach before.
- [x] **D1 — a no-op save is not an edit** (`server/api.js`, `PATCH /api/projects/:id` and
  `PATCH /api/retests/:id`). Both stamped unconditionally. Every client posts the whole
  form, so "open it, change nothing, press Save" was indistinguishable server-side — and
  `GET /api/projects` orders by `updated_at` inside each status group, so the row jumped to
  the top of its block in front of the user. The retest path also stamped its parent
  project; that now follows the retest's decision instead of being written blindly.
- [x] **D2 — the cascade that does change a project now says so** (`PATCH /api/clients/:id`).
  Renaming a client rewrites the denormalised `projects.client` name — text the project list
  renders — and stamped nothing, so a row whose visible content had just changed claimed to
  be untouched for days.
- [x] **The test bench is compared separately.** It lives in `project_pentesters`, not in a
  column that statement writes, so `next` cannot see it. Left out, adding a pentester through
  the drawer form would leave the project claiming an old timestamp while its team cell
  changed — the dedicated assign routes have always stamped.
- [x] **Two paths deliberately left alone**, now asserted so nobody "helpfully" stamps them:
  `PATCH /api/devices/order` (a drag is not an edit — stamping would rewrite twenty rows
  because one moved) and the device-column purge (a sheet schema change, not a device edit).
- [x] **A bulk device save is the caller's promise.** The server does not diff: `extra` is a
  JSON blob, and comparing it by string would flag every row on a key-order change. The
  client already sends only what it changed, and no screen prints a device timestamp.
- [x] **Verify** — 46/46 tests (6 new), live md5 equal, and in the running app: saving an
  unchanged project through the drawer keeps `Updated 3h ago` and keeps the list order, a
  real edit moves the row to the top of its status block, a client rename stamps exactly its
  own projects, and a test row's notes were restored afterwards.

### One pre-existing hazard, not introduced here

`ORDER BY status, updated_at DESC` has no tiebreaker. Two rows written inside the same
millisecond (a client rename stamps every project it owns in a loop) get an arbitrary
relative order. Left as-is: adding `, p.id DESC` would change list ordering for everybody,
which is not what this task asked for.

## `url-per-page`

- [x] **Every page owns a URL**
  - Acceptance: each sidebar row has its own path (`/projects`, `/projects/all`, `/my-projects`, `/my-projects/all`, `/team`, `/users`, `/info`, `/devices`, `/clients`, `/admin/users`, `/admin/properties`); clicking one pushes history; Back/Forward move between pages; a reload on any of them stays on that page; an unknown path falls back to the default page with `replaceState`; a deep link to an admin page the account may not open redirects to that account's page with a toast.
  - Verify: browser pass as admin (11 pages clicked, 11 deep links reloaded, path kept on every one) and as a member (8 pages, `/admin/properties` refused with the toast); zero console errors; `npm test` green (46).
  - Files: `public/js/state.js` (`NAV_PATHS`, `DEFAULT_NAV`, `pathForNav`, `navForPath`), `public/js/shell.js` (`syncUrl`, `handleNav(nav, opts)`, `finishNav(mode)`, popstate listener, boot resolves the nav from the path), `public/js/projects.js`
  - Fixed on the way: `NAV` keyed the accounts page `accounts` while every other place called it `users`, so `NAV[state.nav]` was undefined there and the "is this a real page?" guard bounced a reload straight off the Manage users page. Renamed the entry to `users`.

## `topbar-new-retest`

- [x] **A retest can be raised from the topbar**
  - Acceptance: `+ New retest` sits beside `+ New project` on every page; it asks which project the request belongs to (the drawer underneath, if any, preselected), then captures date/status/notes exactly as the drawer's form does; the drawer's own "New retest" keeps showing no project field (the project is already known); edit still shows start/end dates and no project field; a member (no delete rights) still sees no trash on the created row.
  - Verify: created `RT-006-02` on *Internal HRIS Web App* from `/team`, drawer showed it as Incoming with the project status untouched, deleted it again through the UI; drawer form unchanged (no project select, has date); edit form unchanged (start/end, no select); zero console errors; topbar 430px wide with no overflow; `npm test` 46.
  - Files: `public/js/shell.js` (button + binding, imports `openRetestForm`), `public/js/drawer.js` (`openRetestForm(projectId = null, …)` fetches `api.projects()` only when it has to ask, renders `#r-project`, resolves `targetId` before saving, re-renders the drawer only when one is open)

- [x] **The project list in the retest form is searchable, and only finished engagements appear**
  - Acceptance: `+ New retest` lists only `status = 'Done'` projects (an Ongoing or Hold engagement is not offered); typing in the search box filters by project name or client; a name that matches nothing shows the empty state instead of a blank box; the chosen row is visibly selected with a check; saving without a choice refuses with a toast; the drawer's own retest form is unaffected.
  - Verify: live — 5 of 7 projects offered (Ongoing *Partner Payment API* and Hold *Brimo iOS Build* correctly absent), `core` narrowed to *Core Banking Web Portal*, `zzzz` showed the empty state, saving with nothing chosen said "Choose the project this retest belongs to", creating `RT-005-02` then deleting it left project 5 back to its one pre-existing retest; 430px wide with no overflow; zero console errors; `npm test` 46.
  - Files: `public/js/drawer.js` (`.plist` radio list + `#r-project-q` filter in `openRetestForm`), `public/css/styles.css` (`.plist`, `.plist-item`, `.plist-text`, `.plist-name`, `.plist-meta`, `.plist-check`)
  - Note: the rule is a UI rule only — `POST /api/projects/:id/retests` still accepts any project, so raising a retest from a drawer (or the API) is not blocked by the project's status.

## `split-server-api`

- [x] **One route file per resource**
  - Acceptance: `server/api.js` stops holding route bodies; `index.js` keeps seeing one flat `api` map, so no route, URL, status code or response body changes; the module graph stays acyclic apart from route files importing `shared.js`.
  - Verify: `Object.keys(api)` byte-identical to the pre-split list (56 routes, none missing, none extra, no key defined twice across files); all 73 original top-level declarations present exactly once (`columnValueFor` deliberately deleted — nothing referenced it); `node --check` on all seven files; `npm test` 46/46; live md5 matches; all eleven pages render with zero console errors and every resource group answers 200.
  - Files: `server/api.js` (18 lines — spreads five `routes` maps), `server/shared.js`, `server/routes/{people,projects,catalogue,info,devices}.js`
  - Why one commit instead of one per file: the files were generated from a single source and then proved (identical route table, identical declaration inventory), so there is no intermediate state in which the tree is greener than at the start.

- [x] **Ownership was computed, not chosen**
  - Method: start from each route, walk the declarations it references, and propagate owner sets to a fixpoint. Thirteen helpers ended up shared (`SUPERVISOR_ROLES`, `assertProject`, `canSupervise`, `editStamp`, `getProjectRaw`, `projectSelect`, `properties`, `propertyCache`, `propertyKeys`, `requireCatalogManager`, `requireDeleter`, `retestOpen`, `shapeProperty`); the rest stayed private — people 14, projects 16, catalogue 13, info 9, devices 6.
  - The one rename the move forced: `propertyCache` was exported as a mutable binding and assigned from the catalogue routes, which throws on an imported binding. It is now module state in `server/shared.js` behind `clearPropertyCache()`.

- [x] **Known and left alone**
  - `PATCH /api/properties/:kind/:id` with a non-numeric id compares an integer column against a string, which Postgres rejects with a 500 instead of a 404. The UI only ever sends numeric ids, and tightening it is an input-validation change, not a code move — recorded here instead of folded into this commit.

## `attachments-and-checklists`

- [x] **A project can hold files**
  - Acceptance: upload, list, download byte-identical, delete; the row points at bytes on disk under `${DATA_DIR}/uploads/<projectId>/`, never at a blob column; deleting a project leaves no orphaned bytes and deleting the last file leaves no empty folder.
  - Verify: base64 round-trip test asserts the downloaded buffer equals the uploaded one and that the handler returns `HANDLED` rather than a JSON body (a stream written twice corrupts the response); download headers pinned to `attachment` + both `filename` and `filename*=UTF-8''…` + `octet-stream` + `private, no-store` + `nosniff`; 20 MB limit refused before booking the whole body; deleting a project removes `DATA_DIR/uploads/<id>` entirely.
  - Files: `server/routes/files.js`, `server/routes/projects.js` (`purgeProjectFiles` before the delete), `public/js/files.js`, `public/js/api.js`

- [x] **Why bytes on disk and not `bytea`**
  - 200 MB of reports would make every nightly dump 200 MB, kept for 14 days, and would hold the SQLite write lock for the length of an insert. The price is a second artefact to back up, which is why the `backup` service now writes `onepromag-<stamp>-uploads.tar.gz` beside the dump, says so loudly when the `tar` fails, and the README restore procedure gained the matching `tar -xzf` step — a backup that silently omits the files is worse than no attachments, because it *looks* complete.

- [x] **Downloads are never rendered**
  - `Content-Type: application/octet-stream` regardless of what was uploaded: serving client-supplied HTML or SVG inline from our own origin is stored XSS no matter what the CSP says. `stored_name` is a random uuid — the uploaded filename never touches the filesystem, so path separators, double extensions and 255-byte names stop being a problem instead of being filtered.

- [x] **A project links a checklist, it does not copy it**
  - Acceptance: editing a template changes what linked projects show; a template in use cannot be deleted; an item's status lives in `project_checklist_items` and an unanswered item has no row at all, so attaching a 120-item template writes nothing.
  - Verify: `ON DELETE RESTRICT` on `project_checklists.checklist_id` surfaces as a 409 naming the number of projects; attach writes zero answer rows (asserted); re-answering the same value keeps `updated_at`; an item cannot cite another project's file (`/different project/`); the propagation was also proved in the browser — renaming a template item in the Admin panel changed the item title on the project that links it, with its progress untouched.
  - Files: `server/routes/checklists.js`, `public/js/checklists.js`

- [x] **Two seeded templates, both ordinary rows afterwards**
  - OWASP Top 10 2021 and Web hardening basics, ten items each, inserted `ON CONFLICT (name) DO NOTHING` with items only when a template has none — so a killed seed finishes on the next boot instead of duplicating. Both are editable and deletable like anything an admin typed.

- [x] **Permissions follow the rule already in force**
  - Everyone signed in uploads, downloads, attaches and answers; only admin/lead/sub-lead delete a file, detach a checklist (which destroys answers), or create and edit templates. Checked live as a Member: no `[data-ck-detach]`, no file trash, Checklists absent from the sidebar, and `/admin/checklists` lands on `/projects`.

- [x] **Bugs found while verifying**
  - `(extras.checklists || []).reduce is not a function` — the client helpers return the envelope (`{ checklists }`, `{ files }`), not the array. Every drawer tab was dead until this was destructured.
  - An empty `/data/uploads/<projectId>` outlived its last file; the delete route now calls `removeStored`, and the test asserts the folder is gone rather than merely empty.
  - The paste box's two-column form (`title | help`) is genuinely ambiguous, so the hint now spells out all three shapes instead of claiming the section is optional.

- [x] **Not in scope, deliberately**
  - Template versioning or per-project snapshots of item text, object storage, resumable uploads, thumbnails, virus scanning, attachments on clients/applications/variants/retests, and any cross-project scoring. A checklist records what a pentester found; it does not certify the engagement.

## `checklist-page-and-categories`

Requested as three things at once: the current OWASP lists, a **full page** for a
checklist ("it will need long check list"), and a **default per category** that
attaches itself.

- [x] **OWASP Top 10:2025 and OWASP API Security Top 10 2023, replacing 2021**
  - Acceptance: the web template is the 2025 list with twenty checks (two per risk); the API template is the 2023 list with ten; `OWASP Top 10 2021` is gone rather than sitting beside its successor.
  - Verify: seeded rows are `OWASP Top 10:2025 | Web | default | owasp-web | v1 | 20 items` and `OWASP API Security Top 10 2023 | API | default | owasp-api | v1 | 10 items`; the 2021 row is absent on a database that had it; the seed test asserts the three names, the absence of 2021, and 20/10 distinct sections.

- [x] **Why the seed became versioned instead of insert-once**
  - `checklists.seed_key` + `seed_version` identify a shipped list, so a release replaces its items **in place** — same id, so every project's link survives — and deletes shipped rows whose key disappeared. Rows with `seed_key = ''` (anything an admin typed) are never touched. The cost is the answers on replaced items; shipping a corrected standard with the old answers attached to the wrong items would be worse.

- [x] **A category, and one default per category**
  - Acceptance: `checklists.category` uses the same vocabulary as `projects.category` (`Web · Mobile · API · EDC`); marking a template default clears the previous default in that category; a template with no category cannot be the default.
  - Verify: `claimDefault()` clears and validates, refusing with `Set a category before making a checklist the default`; the Admin table shows the category and a `default` badge.

- [x] **Auto-attach on save, additive and idempotent**
  - Acceptance: creating a project, or saving one after changing its category, attaches that category's default if it is not already attached; nothing is ever detached; any other template is still attachable by hand.
  - Verify: `attachCategoryDefaults(conn, projectId, category)` runs inside the create and update transactions; changing a Web project to API added the API list and left the 2025 list alone; saving again attached nothing; the picker still offered the non-default hardening template, and attaching it made three cards / 40 items.
  - Files: `server/routes/projects.js`, `server/routes/checklists.js`

- [x] **The checklist is a page, not a drawer tab**
  - Acceptance: `/project/<id>/checklist` renders the project's lists with filter chips (All/Open/Pass/Fail/N/A), search, and per-section grouping; the drawer tab becomes a launcher; Back and a cold reload both work.
  - Verify: the URL reloads straight onto the page with the sidebar still highlighting the project list; chips filter, search narrows to zero and prints "Nothing matches that filter."; answering an item updates the item, the list progress, the chips and the answered total without a refetch; a 430px viewport has zero horizontal overflow; zero console errors on the page and in the drawer it was opened from.
  - Files: `public/js/checklist-page.js`, `public/js/checklists.js`, `public/js/drawer.js`, `public/js/state.js`, `public/js/shell.js`, `public/js/projects.js`, `public/css/styles.css`

- [x] **Bugs found while verifying**
  - **Postgres-only 500 on creating a project:** `operator does not exist: boolean = integer` (PG `42883`). `is_default` is `BOOLEAN` on Postgres and `INTEGER` on SQLite, and the SQL compared it to `1`; booleans cannot be bound as parameters either, so every site now writes the literal `TRUE`/`FALSE`. The SQLite tests were green throughout — the bug only existed on the engine production runs.
  - **`NAV.checklist` was missing**, so the page mounted into `Cannot read properties of undefined (reading 'title')` and rendered an empty skeleton. The entry exists for the title and the highlight; it is deliberately not a sidebar row.
  - **The header counters went stale after an answer:** the item updated but the chips still said `Open 10 / Fail 0`, because the drawer's in-place repaint had no reason to touch them. `bindChecklistBody` now takes an `onProgress` callback and the page repaints chips, total and fail badge from the same `links` array.
  - **The sidebar had no active row on the checklist page**, which reads as "lost". `boot()` and `finishNav()` both light the project list instead.

- [x] **Not in scope, deliberately**
  - Per-project snapshots of item text, checklist scoring or a compliance percentage, assigning an owner per item, and attachments as evidence on the full page beyond the field that already exists. A checklist records what was checked; it does not produce a verdict.

## one-checklist-and-drag-drop

**m03593** — "Every project only have 1 checklist, when you click tab checklist auto direct to page." and "The file upload, you can drag and drop".

- [x] **One checklist per project, enforced by the database**
  - Acceptance: a project holds zero or one checklist; attaching a second one replaces the first instead of adding a row; a database that already has duplicates becomes valid on boot.
  - Verify: `CREATE UNIQUE INDEX idx_project_checklists_one ON project_checklists(project_id)`; `dedupeProjectChecklists()` runs before `createIndexes()` on both engines and keeps the newest link per project; `pg_indexes` on the dev stack lists the index; the test suite attaches a second template and asserts one row remains.
  - Files: `server/db.js`, `server/routes/checklists.js`

- [x] **Replacing a checklist is a delete, and says so**
  - Acceptance: the attach route returns `replaced: true` and the number of answers it discarded; asking for the checklist the project already has is a no-op; discarding answers needs the same permission as detaching.
  - Reason: swapping templates deletes `project_checklist_items` the same way detaching does, so letting a Member do it would be a back door around `requireDeleter()`.
  - Verify: `POST /api/projects/:id/checklists` returns `{ checklists, replaced, answered }`; `answered > 0` calls `requireDeleter(ctx, 'a checklist that has answers')`; the picker's subtitle names the answer count, and `[data-ck-change]` is hidden from people who could not complete the swap.
  - Files: `server/routes/checklists.js`, `public/js/checklists.js`

- [x] **Auto-attach fills an empty slot, never overwrites a choice**
  - Acceptance: a project with no checklist gets its category default on save; a project that already has one keeps it, whatever the category.
  - Verify: `attachCategoryDefaults()` returns `[]` as soon as any `project_checklists` row exists; the category test saves twice and asserts nothing extra is attached.

- [x] **The Checklist tab opens the page**
  - Acceptance: clicking the tab in the drawer closes the drawer and navigates to `/project/<id>/checklist`; the tab keeps its fail badge so a failing engagement is still visible from the list.
  - Verify: `[data-tab="checklist"]` calls `closeDrawer()` + `openChecklistPage(project.id)`; probe: drawer gone, `location.pathname === '/project/4/checklist'`, zero console errors; the page's empty state offers `Choose a checklist`, the attached state offers `Change`.
  - Files: `public/js/drawer.js`, `public/js/checklists.js`

- [x] **Drag and drop onto the Files tab**
  - Acceptance: dropping one or many files anywhere in the attachments panel uploads them and refreshes the list once; dropping does not navigate away; the oversize and failure messages still appear.
  - Reason for a whole-panel target: a thin dashed box is a worse aim than "drop it in the Files tab".
  - Verify: a synthetic `DataTransfer` drop of `dropped-note.txt` produced a row; `.is-over` cleared on drop; the depth counter keeps the highlight stable over child elements; deleting the file restored "No files yet".
  - Files: `public/js/files.js`, `public/css/styles.css`

- [x] **Verified end to end on the dev stack**
  - 56/56 tests, md5 live == local for every touched file, `schema_migrations` at 21, `project_checklists` / `project_checklist_items` / `project_files` back to 0 and `/data/uploads` empty afterwards.
  - Chips read `All 10 / Open 8 / Pass 0 / Fail 0 / N/A 2` on a real attached list; the detach dialog named "2 answers and their notes".

## `checklist-admin-page`

- [x] **The index stops reporting what it cannot act on**
  - Acceptance: Admin panel → Checklists shows the checklist, its item count and its actions — no **In use** column; a template a project links still cannot be deleted, and the button says why.
  - Reason: the count was a column of numbers nobody came to the page to read, and the one fact it carried (is this deletable) is already in the disabled state and its title.
  - Verify: `<thead>` reads `CHECKLIST · ITEMS · ACTIONS`; `document.body.innerText.indexOf('In use') === -1`; the delete button on the linked OWASP API template is `disabled` with "Attached to a project — detach it first".
  - Files: `public/js/checklists.js`

- [x] **One template is edited on its own page**
  - Acceptance: the pencil (or the name) opens `/admin/checklists/<id>`; "new" is `/admin/checklists/new`; reloading either keeps you there; Back returns to the index; a Member typing the URL is sent to the project list with the usual toast.
  - Reason: a real list is a hundred rows, and a modal that long is a page with worse scrolling and no URL.
  - Verify: `CHECKLIST_EDIT_PATH` + `state.checklistEditId` in `public/js/state.js`, the `/admin/checklists/(new|\d+)` branch in `navForPath`, `checklist-edit` in `ADMIN_NAV`, `CHECKLIST_LIT` keeping the Checklists row lit, `mountChecklistEditor()` from `finishNav` and `boot()`; probes: `/admin/checklists/9` renders ten sections, `/admin/checklists/new` says "Not saved yet", `bagas` lands on `/projects`.
  - Files: `public/js/state.js`, `public/js/shell.js`, `public/js/projects.js`, `public/js/checklists.js`

- [x] **Every item shows its section**
  - Acceptance: items are grouped under a section heading, each row carries a section select, and changing it re-groups the list immediately.
  - Reason: "which category is this item in" has to be answerable from the row, not from the position it happens to sit in.
  - Verify: ten `.cke-sec-name` headings and ten `.cke-sec-pick` selects on the OWASP API template; moving the first item to another section regrouped the headings to `Beta 2 / Alpha 1` and the save persisted it.
  - Files: `public/js/checklists.js`, `public/css/styles.css`

- [x] **The order on screen is the order saved**
  - Acceptance: up/down move an item among the ones in its section; saving rewrites `position` from array order, and a freshly created item ends up where the list says.
  - Reason: `POST /api/checklists/:id/items` appends (it ignores a supplied position), so a new row inserted mid-list would otherwise land at the bottom.
  - Verify: after moving a row and editing its help, reopening the template read `Check three / Check one / Check two` with the edited help in place; `PATCH /api/checklist-items/:id` is called with `position` for moved rows and again for each created item.
  - Files: `public/js/checklists.js`

- [x] **The panel looks like the rest of the app**
  - Acceptance: no inline `style=` (CSP), the same tokens and radii as other pages, rows legible at 430px, hover reveals the row actions.
  - Verify: `.cke-*` block appended to `public/css/styles.css` (dead `.ck-edit-*` rules removed), editor scrolled to 0 overflow at 430px with 396×102 stacked rows, zero console errors on desktop and mobile.
  - Files: `public/css/styles.css`

- [x] **Verified end to end**
  - Created `ZZ Editor` from `/admin/checklists/new` (three pasted items), regrouped and reordered it, saved, reopened, deleted it through the page; index back to three templates. 56/56 tests, md5 live == local for all five touched files.

## `project-page`

- [x] **The drawer's footer Edit is gone; Expand took its place**
  - Acceptance: the drawer's footer carries the updated stamp and a full-page button, no Edit; the header keeps Edit beside Delete.
  - Reason: Edit was in two places and the footer is where the eye lands last; the header already had Edit next to Delete, and the footer's real estate belongs to the thing the drawer cannot do — be a page.
  - Verify: `.drawer-foot` buttons read `["Open full page"]`, `.drawer-foot [data-edit]` count 0, `.drawer-head [data-edit]` still 1, `[data-expand]` 2 (header icon + footer button); the Retests tab keeps its own `New retest` footer button.
  - Files: `public/js/drawer.js`, `public/js/icons.js` (new `expand` glyph)

- [x] **A project has a page of its own**
  - Acceptance: `/project/<id>` renders the project's overview, retests and notes together; reload, bookmark and Back all work; the project list row stays lit; a Member sees no Delete; an unknown or deleted id returns to the list with a toast.
  - Reason: the drawer is 520px wide and sits on top of the list. A bench of six, four retests and a page of notes does not fit in a glance, and a glance has no URL to send anyone.
  - Verify: `PROJECT_PATH` + `state.projectViewId` + the `/project/(\d+)` branch in `navForPath` + the `project` NAV entry in `public/js/state.js`; `openProjectPage()` + `CHECKLIST_LIT.project = 'active'` + the `mountProjectPage()` branches in `public/js/shell.js`; `projectPageHTML()`/`mountProjectPage()` in `public/js/project-page.js`; probes: `/project/4` renders title "Partner Payment API", subtitle `PayGate Indonesia · API`, three `.pjp-sec`, 11 info cells, one lit nav row (`active`), zero overflow at 430px and at 1440, zero console errors on reload; `bagas` opens it with 0 `[data-pjp-del]`.
  - Files: `public/js/project-page.js` (new), `public/js/state.js`, `public/js/shell.js`, `public/js/projects.js`, `public/css/styles.css`

- [x] **One implementation behind both surfaces**
  - Acceptance: the page's Overview/Retests/Notes panels and every control in them behave exactly as in the drawer, without a second copy of the logic.
  - Reason: two renderers for one panel is how a status button ends up meaning two different things — the same reason the checklist page reuses the drawer's renderer.
  - Verify: `tabBody()` renders the panels on both; `bindProjectActions(el, project, retests, extras, reload)` holds the status menu, Edit notes, Who pentest, New retest, retest edit/delete and file handling, and `bindDrawer()` now only adds the drawer's own tab/close/delete wiring. Probe: the page's quick-status menu, notes modal ("Edit notes"), team modal ("Who pentest"), retest modal ("New retest request", no project picker because the project is known) and the project form ("Edit project") all opened from `/project/4`.
  - Files: `public/js/drawer.js`, `public/js/project-page.js`

- [x] **A latent bug the page exposed, fixed**
  - Acceptance: opening, closing and reopening a quick-status menu never throws.
  - Reason: `placeMenu()` portals an open menu into `<body>` (a transformed ancestor breaks `position: fixed`), so the second click on the same toggle looked for the menu inside its host and found nothing — `TypeError: Cannot read properties of null (reading 'hidden')` at `public/js/drawer.js`. It existed before this change; the new page simply made the menu easier to open twice.
  - Verify: `menuOf(toggle)` falls back to the portalled node via `menu._qsHome`; the toggle click now queries every `.quick-status-menu` document-wide before closing them. Probe: open → close → open reports `1 / 0 / 1` visible menus and an empty error list.
  - Files: `public/js/drawer.js`

- [x] **The page keeps the drawer's tabs, and the tab is in the URL**
  - Acceptance: `/project/<id>` shows Overview · Checklist · Files · Retests · Notes with the same counts as the drawer; each tab has an address; reloading or bookmarking it lands on that tab; Back undoes a tab click; the Checklist tab leaves for the checklist page.
  - Reason: "which of these five things am I looking at" is the same question on a page as in a column, and the tab you were reading is part of the address — a link that always opens Overview is a link you have to re-navigate by hand.
  - Verify: `PROJECT_PATH(projectId, tab)` keeps Overview as the bare path and appends the rest; `state.projectTab` + the `(overview|checklist|attachments|retests|notes)` group in `navForPath`; `openProjectPage()` resets the tab and clears the page cache. Probes: four tab clicks gave `/project/4`, `/project/4/attachments`, `/project/4/retests`, `/project/4/notes` with the right panel each time; a reload on `/retests` came back on retests; `history.back()` from `/notes` returned to `/retests`; `/project/4/bogus` and `/project/9999` both land on `/projects` (the second with "That project is gone — pick another one"); `bagas` opens all four tab URLs with 0 delete buttons and zero console errors.
  - Files: `public/js/project-page.js`, `public/js/state.js`, `public/js/shell.js`, `public/css/styles.css`

- [x] **Verified end to end**
  - 56/56 tests; md5 live == local for all seven touched files; all twelve nav pages render with zero console errors in both themes; `history.back()` from `/project/4` lands on `/projects`; the checklist page at `/project/4/checklist` still renders ten items and its Back button still says "Projects"; 430px page and tab strip both 0 overflow (tabs 398/398).

## notes-edited-in-place

Operator request (three identical sends): *"Each project : - When click Edit notes,
should not pop up but direct edit inside box - For Pentest notes same like Notes,
only 1 notes"*.

- [x] **Edit notes edits the box, it does not open a dialog**
  - Acceptance: pressing Edit on the Notes tab turns the text being read into a textarea in the same place; no modal appears; Cancel restores the original text; Save persists and the tab keeps showing the new text; `Ctrl/Cmd+Enter` saves and `Escape` abandons.
  - Reason: the text *is* the tab. A modal re-flowed it into a 7-row box under a dimmed page, so comparing "what I wrote" with "what it should say" meant remembering one of the two. The comment on the old handler already said "opening the whole project form to change one textarea buries the field the user actually asked for" — deleting the form was half the fix; the dialog was the other half.
  - Verify: `notesFieldHTML(kind, value)` + `bindNotesField(root, projectId, kind, reload)` in `public/js/notes-editor.js`, used by both `public/js/drawer.js` (both note tabs) and `public/js/project-page.js`; `openNotesForm` and the `[data-edit-notes]` listener deleted. Probes: on `/project/4/notes`, clicking Edit hid `.nfield-view`, showed `.nfield-edit`, left `!!document.querySelector('.modal')` false and focused `#nfield-notes`; Cancel restored the original text exactly; three typed lines saved as 5 lines with the toast `Notes saved`; the drawer's Notes tab did the same on both counts.
  - Files: `public/js/notes-editor.js` (new), `public/js/drawer.js`, `public/js/project-page.js`, `public/css/styles.css`

- [x] **Pentest notes is one field, like Notes**
  - Acceptance: one working note per project instead of a timeline of entries; edited in the same box-in-place way; a database that already holds entries keeps the newest one and loses nothing else; clearing the box clears the note.
  - Reason: the timeline was my own over-design. Reading an engagement back is one question — *what did we find?* — and answering it out of entries dated across three days is the reading work the field was meant to save. One field also removes the failure the entries existed to prevent: with one row per project there is nothing for a second tester to append to, and the route is a `PUT`, so a retried save is idempotent.
  - Verify: `projects.pentest_notes` in both schema files, `project_pentest_notes` DDL deleted; `migratePentestNotesIntoColumn()` (schema 23) carries the newest non-empty entry per project, logs `[db] carried N working note(s) into projects.pentest_notes`, then drops the table; `PUT /api/projects/:id/pentest-notes` in `server/routes/pentest-notes.js` (56 lines, `MAX_BODY = 20000`, empty allowed because emptying is the deletion, `editStamp` so a no-op save does not move the stamp); `api.savePentestNotes`; `public/js/pentest-notes.js` deleted; test 57 rewritten (replace-not-append, no-op keeps the stamp, the two fields do not overwrite each other, empty clears with `cleared: true`, a Member can write) — 57/57. Migration proved on a synthetic v22 SQLite database holding two entries: the newest was carried, the scope notes were untouched, the table was gone, version 23. Live: `schema_migrations` 23, `asdf` carried into `projects.id = 4`, no `project_pentest_notes` table in Postgres.
  - Files: `server/db.js`, `server/schema/sqlite.sql`, `server/schema/postgres.sql`, `server/routes/pentest-notes.js`, `server/routes/projects.js`, `public/js/api.js`, `public/js/notes-editor.js`, `test/api.test.js`

- [x] **Verified end to end**
  - 57/57 tests; md5 live == local for every touched file except `test/api.test.js` (not copied into the image); both note fields open, save, cancel and clear in place on the project page *and* in the drawer; empty-state button reads "Add notes"; 430px page and editor both 0 overflow (textarea 368px); `bagas` gets an Edit button on both tabs with zero console errors; no modal opens anywhere in either flow; the seeded scope notes were restored to their original text and every working note is empty after testing.
  - Not in scope (unchanged): no authorship or "edited" stamp on the working note now that it is one field — the project's own `updated_at` is the only record that it changed.

## library-pages

Operator request (m05227): *"Add New Feature at Navbar : - Tests -> Explaination
about how to test checklist very detail and clear - Findings -> Common Findings
Findings -> Simple Description, Impact, Mitigation"*.

- [x] **Tests — how to test each area, in the order you would work**
  - Acceptance: one guide per risk category of both default templates (A01–A10 Web, API1–API10 API), each with what the category means, numbered steps, what a pass looks like, the tools, and the classic over-calls; searchable by any word in any section, filterable by area; `showing N of M` counts the whole library.
  - Reason: the checklist tells you *what* to check and stops there. The gap between a list of twenty items and a done engagement is the method — whether to test access control before or after authentication, and which tool answers the question. Putting that beside the checklist it belongs to is the point of the page; keeping it out of the checklist itself keeps the item list short enough to work through.
  - Verify: `GET /api/tests` → `{ guides }` from `server/knowledge.js`; `/tests` cold-loads 20 guides with the first one open; `API` chip → 10; searching `ssrf` → 1, opening `API7:2023`; Escape clears the box but keeps the chip; zero console errors.
  - Files: `server/knowledge.js` (new), `server/routes/knowledge.js` (new), `public/js/library.js` (new), `public/js/state.js`, `public/js/shell.js`, `public/js/projects.js`, `public/js/api.js`, `public/css/styles.css`

- [x] **Findings — description, impact, mitigation, and a way to prove it**
  - Acceptance: twenty common findings, each with a plain description, an impact, and a mitigation list, a severity the page can colour, a CWE where one fits, and a link to the guide that tests for it; filterable by severity and searchable; a guide lists the findings it produces.
  - Reason: a report is written under time pressure, and the expensive part is not finding the bug but saying what it costs and how to close it. Twenty written-up findings turn that into editing. Linking the two libraries both ways is what stops either from being an orphan page.
  - Verify: `GET /api/findings` → `{ findings }`; `/findings` renders 20 cards, 4 columns at 1920 and 1 at 430; a guide's finding link lands on `/findings` with that card ringed (`.is-focus`) and the severity chip cleared; the card's "How to test this" lands back on the guide; 0 dangling links, 0 duplicate ids.
  - Files: `server/knowledge.js`, `server/routes/knowledge.js`, `public/js/library.js`, `public/js/state.js`, `public/css/styles.css`

- [x] **Content is code, not rows**
  - Acceptance: fixing a sentence ships with the release; no schema bump, no seed version, no Admin editor; both routes read arrays.
  - Reason: the checklists are rows because an admin owns them. These are reference pages the team reads — a table would make a typo a migration and invite edits that then need preserving across releases. Shipping them in `server/knowledge.js` keeps `SCHEMA_VERSION` at 23 and makes the text reviewable in a diff, which is the only review that matters for prose.
  - Verify: `server/knowledge.js` exports `TEST_GUIDES` and `COMMON_FINDINGS`; the routes are two lines each; no schema change in the commit.
  - Files: `server/knowledge.js`, `server/routes/knowledge.js`, `server/api.js`

- [x] **Verified end to end**
  - 59/59 tests; md5 live == local for all seven touched files; `/tests` and `/findings` load cold as admin and read as `bagas` over HTTP (anonymous → 401); deep links answer `200 text/html`; desktop `lib-split` = `300px 1294px`, findings `4 × 393.5px`; 430px both pages 0 overflow with the index as a horizontal strip; zero console errors in both flows.
  - Not in scope: no editing, no "copy for report" button, and no per-project notes on a finding — this is a reference, not a second note store.
