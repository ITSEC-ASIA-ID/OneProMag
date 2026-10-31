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
and two things that only look like defects. Full reasoning in `SPEC-updated-at.md`.

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
