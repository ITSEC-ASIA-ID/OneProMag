# Capability map: OneProMag hardening & maintainability

Scope check (Phase 0). The approved request — "all" of the queued quality items — bundles
**two independently testable capabilities** that share no files, so it is decomposed
here before any spec is written. Nothing below is implemented until this map is approved.

| Module id | Responsibility | Depends on | Touches |
|---|---|---|---|
| `harden-api` | Login throttling (R1), security headers (R2), SQLite lock correctness (R3), real indexes vs. invented ones (R12) | — | `server/*` only |
| `split-app-js` | Reduce `public/js/app.js` (9110 lines) into modules without changing behaviour | `harden-api` (only for the final `npm test` + live verification run) | `public/js/*`, `public/index.html` |

**Build order:** `harden-api` → `split-app-js`. Not because of a code dependency — the
two never touch the same file — but because the split needs a trustworthy full test run
and a browser verification pass, and `harden-api` is what makes that run mean something.
Running them in parallel would also put a server restart and a client rebuild in the same
verification window, which is how a "which change broke it" question becomes unanswerable.

**Interfaces at the boundary:** none. `harden-api` adds no response field the client
reads, and `split-app-js` changes no request shape. That is deliberate — it is what keeps
the two independently shippable.

**Not in this map** (recorded so nobody re-discovers it as an omission):

- Item 4, prod defaults (`POSTGRES_PASSWORD` etc.) — explicitly declined by the user.
- `documents` / `info_entries` orphan sweeps, variant purge — already shipped.
- Any new feature.

## Specs

- `SPEC-harden-api.md`
- `SPEC-split-app-js.md`
