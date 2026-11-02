# Spec: `harden-api`

Status: **draft — awaiting approval**. No code until approved.

## Objective

Close four defects in the server found by the earlier four-axis review, without changing
any request or response shape the browser depends on, and without adding a dependency.

| Id | Defect | Why it matters |
|---|---|---|
| R1 | `POST /api/auth/login` has no throttle | Unlimited guesses against `admin/<bootstrap password>`. The prod boot log re-prints that password on every start, so the username is never a secret. |
| R2 | No `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options` | Session cookie is `HttpOnly`; without `frame-ancestors` the whole app can be framed and clickjacked into a delete. Without CSP, any future DOM-XSS is unmitigated. |
| R3 | `createSqliteDriver().run()` executes outside `withLock()`, and no `busy_timeout` is set | A `run()` that lands inside someone else's `BEGIN IMMEDIATE` throws `SQLITE_BUSY` at an unpredictable moment. Dev runs on SQLite; this is a live crash, not a theoretical one. |
| R12 | Index/expiry audit | Partly wrong as originally stated — see below. |

**User-visible success:** login behaves exactly as today until someone fails repeatedly;
framing the app is refused; SQLite writes cannot race; the queries that run on every page
touch an index instead of scanning.

## The R12 correction (finding, recorded before work starts)

The review claimed three indexes were missing. Checking the code:

- `project_pentesters(user_id)` — **genuinely missing.** `createIndexes()` at
  `server/db.js:1267-1300` has no statement for this table at all. The primary key is
  `(project_id, user_id)`, so a lookup by `user_id` alone (the "my projects" filter,
  `server/api.js:1678-1699`) cannot use it.
- `retests(project_id, status)` — **partly there.** `idx_retests_project ON retests(project_id)`
  exists. The composite is still worth having because every "open retest" test is
  `project_id = ? AND status <> 'Done'` (`retestOpen()`); a `status`-only or
  `project_id`-only index reads candidate rows and filters. Additive, not a fix.
- `sessions(expires_at)` — the index is **the wrong fix for the real bug.** No query in the
  codebase ever filters or sorts on `expires_at`:
  `server/auth.js:199-207` loads a session by `token` (the primary key) and compares
  `expires_at` in JavaScript. `server/cli.js:94` deletes by `user_id`. So an index on
  `expires_at` would be dead weight. The real problem is that **an expired session is never
  deleted** — it is only refused at read time. An index only helps a sweep, so the sweep is
  what this spec adds, and the index rides along with it.

## Commands

```
Install:  npm ci
Test:     npm test                      # node --test test/*.test.js — currently 35 tests
Dev:      npm run dev                   # node --watch, SQLite in ./data
Dev (pg): npm run start:pg
Boot:     docker compose up -d --build --force-recreate     # dev, SEED_DEMO=1
Prod:     docker compose -f docker-compose.prod.yml up -d --build   # no .env, no flags
Shell:    docker exec onepromag md5sum /app/<path>          # live file == local file
```

## Project structure (only the files this spec touches)

```
server/index.js        response headers + login throttle hook      (R1, R2)
server/auth.js         throttle state, session sweep                (R1, R12)
server/db.js           createIndexes() statements, boot-time sweep  (R12)
server/drivers/sqlite.js   withLock around run(), busy_timeout      (R3)
server/drivers/shared.js   createLock() — read-only, likely unchanged
server/schema/*.sql    PRAGMA / index declarations, kept in sync
test/api.test.js       new cases                                    (all)
```

## Code style

Smallest change that is correct. Match what is already there — no new abstraction layer,
no config file for a constant that has one sensible value.

```js
// R1: the state lives next to the code that reads it, keyed by the thing being guessed at.
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILURES = 8;
const loginFailures = new Map(); // key -> { count, firstAt }

export function loginThrottled(key) {
  const entry = loginFailures.get(key);
  if (!entry) return 0;
  if (Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return 0;
  }
  return entry.count;
}
```

```js
// R3: run() takes the same lock transaction() takes — one writer at a time, always.
async run(sql, params = []) {
  return withLock(async () => {
    const info = db.prepare(sql).run(...params);
    return { rowCount: Number(info.changes), lastInsertId: Number(info.lastInsertRowid) };
  });
}
```

## Testing strategy

`node:test` against the route map directly, demo seed as fixture, `DATA_DIR` a temp dir —
the existing harness in `test/api.test.js`, extended. No HTTP client, no new package.

- **R1** — 8 wrong passwords → 401; the 9th → **429** with a `Retry-After` header; a correct
  password inside the window still → 429 (that is the point of a lockout); the counter is
  per-identifier, so failing on `admin` does not lock `rafi`; a success clears the counter.
- **R2** — `sendJSON` and `serveStatic` both carry the four headers; `index.html` still loads
  with `script-src 'self'` (verified live in the browser, not just in the test).
- **R3** — `transaction()` with a `run()` inside it commits; a `run()` that throws inside a
  transaction still rolls back; two overlapping transactions serialise rather than throw
  `SQLITE_BUSY`. Plus a direct check that `PRAGMA busy_timeout` reads back non-zero.
- **R12** — the three index names exist after boot (`SELECT name FROM sqlite_master …` /
  `pg_indexes`); an expired session row is gone after the sweep.

Every case asserts behaviour, not implementation: no test reaches into `loginFailures`.

## Boundaries

**Always**
- `npm test` green before committing; one commit per defect with the reason in the message.
- Keep SQLite and Postgres in step — a change to `server/schema/sqlite.sql` that has no
  counterpart in `server/schema/postgres.sql` (or vice versa) is a bug.
- Verify in the running container (`md5sum` live == local, zero console errors) before
  calling anything done.
- Keep `SCHEMA_VERSION` bumping only when the schema actually changes.

**Ask first**
- Adding any dependency (this spec's whole point is that none is needed).
- Changing the `Cache-Control`/ETag logic in `serveStatic` — it exists because a stale `.js`
  survived a rebuild once.
- Touching the bootstrap-password banner.
- Anything that logs credentials, hashes or full request bodies.

**Never**
- `Network.clearBrowserCookies` or any profile-wide CDP command.
- Moving port 3131, `docker compose down -v`, deleting a volume, `git reset --hard`,
  `git push --force`.
- A lockout that can be triggered by a third party against a known username with no
  recovery path (see the deliberate limitation below).
- Storing the password attempt, or the identifier, in a log line.

## Success criteria

1. 9 consecutive bad passwords for one username → 429 on the 9th and on every attempt after
   it inside the window; `Retry-After` present; a different username is unaffected; the
   correct password inside the window is also refused.
2. Every response from `/api/*` and every static asset carries `Content-Security-Policy`,
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, and framing is refused.
   The app loads and works with the CSP active — checked in the browser, all pages.
3. `PRAGMA busy_timeout` is set on connect; `run()` holds the same lock as `transaction()`;
   the SQLite transaction tests pass with no `SQLITE_BUSY`.
4. `idx_retests_project_status`, `idx_project_pentesters_user` and `idx_sessions_expires`
   exist after boot on **both** engines; expired session rows are deleted on boot and
   swept periodically.
5. `npm test` passes; prod stack boots clean from `docker-compose.prod.yml` with no `.env`;
   dev stack verified live with zero console errors.

## Open questions — these are decisions I will not take on your behalf

1. **Does login lockout need an escape hatch?** A pure in-memory lockout lets anyone lock
   `admin` out for 15 minutes by guessing wrong 8 times. Options: (a) accept it, it is
   self-healing and there are no shared accounts; (b) let the admin reset it with
   `node server/cli.js` (a new CLI command); (c) rate-limit rather than lock — delay
   responses instead of refusing, so a legitimate user just waits. **I lean (a) + the
   existing CLI password reset, because (c) keeps the door open and (b) is a feature you
   did not ask for.**
2. **Is the failure key the username, the client IP, or both?** IP is the correct one against
   credential stuffing, but the app sits behind Caddy in prod and no proxy header is
   trusted today, so every request would share one key — an app-wide lockout. **I propose
   keying on the identifier only, and recording the missing trusted-proxy setup as a
   follow-up rather than half-implementing it.**
3. **CSP with `style-src 'self'`, or `'unsafe-inline'`?** There are 34 inline `style="…"`
   attributes in `public/js/app.js` (drag positions, board rails, computed widths). A strict
   `style-src 'self'` breaks every one of them and the fix belongs to `split-app-js`, not
   here. **I propose `script-src 'self'; style-src 'self' 'unsafe-inline'` now, and dropping
   `'unsafe-inline'` in `split-app-js` after the inline styles are converted.** Note the
   app already loads Google Fonts from `fonts.googleapis.com`, so `style-src` and `font-src`
   must allow those two hosts or every page loses its typeface.
4. **`X-Frame-Options` or `frame-ancestors`?** The CSP `frame-ancestors 'none'` is the modern
   directive and is what browsers enforce; `X-Frame-Options: DENY` only matters for browsers
   predating CSP Level 2. **I propose sending both** — it is one line and costs nothing.
5. **Sweep interval for expired sessions.** On boot only, or also every N minutes in a
   timer? **I propose boot + a 1-hour `setInterval` that is `unref()`d**, so it never holds
   the process open and a long-running container cannot accumulate dead rows.
