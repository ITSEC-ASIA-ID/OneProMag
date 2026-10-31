# Spec: `updated-at`

Status: **draft — awaiting approval**. No code until approved.

## The audit (R6, done before writing this)

R6 from the four-axis review said "audit the `updated_at` call sites". The audit is now
done. Five tables carry `updated_at` (`info_entries`, `documents`, `devices`, `projects`,
`retests`; the catalogue tables deliberately do not). Every write path is accounted for:

| Table | Path | Stamps? | Verdict |
|---|---|---|---|
| `projects` | `PATCH /api/projects/:id` | always | **wrong** — an unchanged save moves it (D1) |
| `projects` | `POST/DELETE /api/projects/:id/pentesters` | always | correct |
| `projects` | `DELETE /api/retests/:id` | always | correct |
| `projects` | `PATCH /api/retests/:id` | always | **wrong** — an unchanged save moves it (D1) |
| `projects` | `PATCH /api/clients/:id` (`client` copied onto projects) | **never** | **wrong** — the row changed and nothing says so (D2) |
| `retests` | `PATCH /api/retests/:id` | always | **wrong** (D1) |
| `info_entries` | `PATCH /api/info/:id` | only on real content change | correct — this is the pattern |
| `documents` | `PATCH /api/docs/:scope/:scopeId` | always | correct — either half of a document changing *is* an edit |
| `devices` | `PATCH /api/devices/:id` | always | correct — the form sends every field, so a changed one is impossible to miss |
| `devices` | `PATCH /api/devices/bulk` | per changed row | correct — the client diffs before sending |
| `devices` | `PATCH /api/devices/columns` (extra purge / order) | **never** | correct — see below |

Two of these are *not* defects even though they look like it, and the spec records why so
nobody "fixes" them later:

- **`PATCH /api/devices/order`** rewrites `position` on every row without stamping. A
  drag-reorder is not an edit to the device, and stamping twenty rows because one was
  dragged would make the whole inventory claim it was just edited.
- **`PATCH /api/devices/columns`** rewrites `devices.extra` when a user-added column is
  deleted. The column removal is a schema change to the sheet, not an edit to any device.
  It is also already gated behind `requireDeleter()`.

## The three defects

### D1 — an unchanged save claims the row was edited, and moves it

`projects` and `retests` stamp `nowISO()` unconditionally. Every client sends the whole
form on save, so "open the project, change nothing, click Save" is indistinguishable
server-side from a real edit.

It is visible: `GET /api/projects` orders `p.updated_at DESC` **inside each status group**
(`server/api.js:1744`). A project in `Ongoing` that was merely re-saved jumps to the top of
the Ongoing block, above one that was genuinely changed a minute earlier. The drawer footer
prints `Updated ${fmtRelative(project.updatedAt)}`, and the sidebar's project list is
re-drawn by `refreshAll()`, so the reordering happens in front of the user.

`projects` is worse than `retests`: it also does the write (the `UPDATE` itself) and touches
`updated_at` even when nothing in the payload differs.

### D2 — the cascade that *does* change a project never says so

`PATCH /api/clients/:id` renames the client and then runs
`UPDATE projects SET client = ? WHERE client_id = ?` to keep the denormalised copy in sync
(`server/api.js:2065`). `projects.updated_at` is not touched. So the row that is rendered in
every project list — `PARTNER PAYMENT API` sits under its client name — changes its visible
content while claiming it was last updated days ago.

This is the mirror image of D1: the same write, wrong in both directions.

### D3 — the note-edit rule is written inline and cannot be reused

`PATCH /api/info/:id` computes `contentChanged` and picks `nowISO()` or `row.updated_at`
inline (`server/api.js:2462-2466`). The rule is right, the reasoning is documented, and it
is the only correct implementation in the codebase — but it is seven lines inside one
handler, so D1 and D2 could not consult it and it will not be found by whoever writes the
next `PATCH`.

## Objective

Make "was this row actually edited" a single, named rule, use it on every write path where
a full-form save makes a no-op possible, and make the one genuine cascade announce itself —
without changing any request shape, response shape, ordering key, or client code.

| Id | Fix |
|---|---|
| D1 | Extract the rule as `editStamp(next, row, fields)` — compare the fields the statement actually writes, return `nowISO()` on a real difference and the existing stamp otherwise. Use it for `projects` and `retests` in `PATCH`. |
| D2 | Stamp `projects.updated_at` in the client-rename cascade; the client name shown on the row did change. |
| D3 | The rule lives in one exported helper near `resolveDates()`, with the "a bookmark is not an edit" reasoning moved onto it as a doc comment; `PATCH /api/info/:id` calls it instead of its inline copy. |

**Why a helper and not `updated_at` triggers:** a trigger cannot know whether the writer
meant to edit (it sees the new row, not the intent), and SQLite and Postgres triggers would
have to stay in sync with each other and with `resolveDates()`'s date stamping. The
comparison belongs where the semantics are known.

**Why compare fields and not the whole row:** `updated_at` is itself a column, so a
whole-row compare is always "different" the moment the statement runs. The helper must be
handed the exact field list the statement writes, which is also what keeps it honest when a
column is added.

## Acceptance

- Saving a project or a retest with no changed field leaves `updated_at` byte-identical and
  does not reorder the list.
- Changing any single field of a project or retest moves `updated_at`.
- A status change still moves it, including the date side effects (`resolveDates`): an
  `Ongoing` transition that auto-stamps `started_at` is an edit even if no body field moved.
- Renaming a client moves `updated_at` on every project that points at it, and on nothing
  else.
- `PATCH /api/info/:id` keeps its current behaviour exactly (pin-only stays quiet).
- Reordering devices leaves every `updated_at` alone — asserted, so a future refactor
  cannot "helpfully" stamp twenty rows because one was dragged.
- A bulk device save stamps exactly the rows it is given. The server does not diff
  them, because it cannot do so faithfully (`extra` is a JSON blob, and comparing it
  by string would flag every row on a key-order change). The client diffs before
  sending, and no screen prints a device timestamp — so this is the one path where
  "unchanged" is the caller's promise rather than the server's.
- No request or response shape changes; no client change; `npm test` green and extended.

## Commands

```
Test:     npm test                      # node --test test/*.test.js
Dev:      docker compose up -d --build --force-recreate
Shell:    docker exec onepromag md5sum /app/<path>
```

## Files

`server/api.js` (the helper, four call sites, two comments), `test/api.test.js` (new cases),
`tasks/todo.md`, `tasks/plan.md`.

## Out of scope

- Adding `updated_at` to tables that lack it (`clients`, `applications`,
  `application_variants`, `users`, `properties`). Nothing reads it there, and adding a
  column to five tables to satisfy symmetry is the kind of change that breaks a migration.
- Any client-side change. The drawer already prints the stamp; it will now be accurate.
