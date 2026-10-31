# Plan: `harden-api` → `split-app-js`

Approved basis: `SPECS.md`, `SPEC-harden-api.md`, `SPEC-split-app-js.md`.

## Decisions taken where the specs left them open

| Open question | Taken | Reason |
|---|---|---|
| Lockout escape hatch | Failure counter only, **no lockout refusal**. Attempts beyond the limit are delayed, and the delay grows (0 → 400ms → 800ms → 1600ms, capped at 2s). | Keying on identifier alone, a hard refusal lets any stranger lock `admin` out for 15 minutes. A growing delay costs a human ~2s and costs a script 8 × 2s per guess. No new CLI command, no way to deny service. |
| Throttle key | Identifier (lowercased, trimmed). | Prod sits behind Caddy and no proxy header is trusted, so an IP key would be one shared counter = app-wide stall. Recorded as a follow-up. |
| `X-Frame-Options` | Send both it (`DENY`) and `frame-ancestors 'none'`. | One line, covers pre-CSP browsers. |
| Session sweep | Boot + `setInterval` every hour, `unref()`d. | A long-running container must not accumulate dead rows; `unref` means it never holds the process open. |
| CSP | `script-src 'self'`, `style-src 'self' 'unsafe-inline'` + Google Fonts hosts. `'unsafe-inline'` deferred to `split-app-js`. | 34 inline `style=` attributes; strict `style-src` would blank every page. `script-src` is strict from day one (`eval`/`new Function`: zero hits). |
| Split granularity | 12 modules, one commit each. | Derived from the page structure the nav already defines. |

## Order

`harden-api` has four independent tasks. Each is one commit, each verified before the next.

1. R3 — SQLite lock + `busy_timeout` (smallest, no user-visible change, unblocks trustworthy tests)
2. R12 — indexes + `expireSessions()`
3. R1 — login throttle
4. R2 — security headers (last: it is the only one that can break the UI, so it lands when
   everything else is already green and a broken page is unambiguous)

Then `split-app-js`, 11 commits, lowest-risk area first, browser-verified per commit.

---

## `updated-at` — the R6 audit

R6 was queued as an audit, so the first deliverable was the finding list, not a patch.
Audit → `SPEC-updated-at.md` → implement → verify, in that order; the spec records the two
paths that look wrong and are right, because those are the ones a future reader would
otherwise "fix".

| Open question | Taken | Reason |
|---|---|---|
| Helper or `updated_at` trigger? | Helper in `server/api.js` | A trigger sees the new row, not the intent, and would have to stay in sync across both engines *and* with `resolveDates()`'s date stamping. |
| Compare the whole row or the written fields? | Written fields | The row contains `updated_at` itself, so a whole-row compare always differs. Building the `SET` list from the same key object is what keeps them truthful. |
| Stamp the parent project when a retest changes? | Yes, using the retest's own decision | It already did — unconditionally. Now a no-op retest save leaves the project alone too. |
| Fix the missing `ORDER BY` tiebreaker while here? | No | Real, pre-existing, and would reorder everybody's list. Recorded in `tasks/todo.md` instead. |
