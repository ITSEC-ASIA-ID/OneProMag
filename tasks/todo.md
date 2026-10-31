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
