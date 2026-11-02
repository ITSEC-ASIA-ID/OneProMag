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
