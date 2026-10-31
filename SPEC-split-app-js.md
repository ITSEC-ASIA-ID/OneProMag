# Spec: `split-app-js`

Status: **draft — awaiting approval**. No code until approved.

## Objective

`public/js/app.js` is 9110 lines in one file: 170 top-level functions plus a single 86-line
`state` object that every one of them closes over. Two consequences, both already felt:

- **Every edit risks the whole app.** A typo anywhere is a syntax error that blanks every
  page, and `node --check` is the only guard before a browser reload.
- **Nobody can find anything.** "Where is the retest delete?" is a `grep`, not a file name.

**Goal:** split it into modules by feature, one file per area, with **zero behaviour change**
— same DOM, same classes, same requests, same keyboard handling. Not a refactor of the app's
internals; a change of where the lines live.

**Success is defined by what does not change:** every page renders identically, every
interaction works, the 35 API tests still pass, and the browser console stays empty.

## Non-goals

- No state management rewrite. `state` stays one shared object; it just gains one owner
  module instead of living at the top of a monolith.
- No framework. No build step — the app ships ES modules from `public/` as-is, and adding
  a bundler would break the Docker file's `md5sum`-a-localfile deploy story.
- No renaming of CSS classes, element ids, `data-*` attributes, or API routes. Those are
  contracts with `public/css/styles.css` and `server/api.js`.
- No converting the 34 inline `style="…"` attributes (that is a separate change, tracked as
  a follow-up in `SPEC-harden-api.md` open question 3).

## Commands

```
Syntax gate:  for f in public/js/*.js; do node --check "$f"; done
Test:         npm test
Boot:         docker compose up -d --build --force-recreate
Live check:   docker exec onepromag md5sum /app/public/js/<file>   # must equal local `md5sum`
```

## Target structure

`public/index.html` keeps one `<script type="module" src="/js/app.js">`. `app.js` becomes
the entry point only: imports, boot, and nothing else.

```
public/js/
  app.js          ~120 lines — imports every page, wires nav, calls boot()
  api.js          unchanged (already separate)
  ui.js           unchanged
  icons.js        unchanged
  props.js        unchanged
  state.js        NEW — the `state` object, `ENUMS`, `normalizeNav`, `navAllowed`, `NAV`,
                  `canManageCatalog`, `setProperties` re-export
  shared.js       NEW — helpers used by 3+ pages: escape/initials/avatar/statusBadge,
                  `placeMenu`/`hideMenu`, `toast`, `openPerson`, paging (`PAGE_SIZES`,
                  `pageSlice`, `pagerHTML`), `currentQuery`, load-token guard
  auth.js         NEW — `renderAuth` (login/register screen), `openAccountMenu`,
                  `openProfileForm`, `openPasswordForm`, stats strip
  shell.js        NEW — `sidebarHTML`, `shellHTML`, `bindShell`, `bindSidebar`,
                  `handleNav`, `finishNav`, `setTitle`, presence (6 fns + poll timer)
  projects.js     NEW — `filtersHTML`…`bindFilters`, `projectCardHTML`, `projectTableHTML`,
                  `listRows`, `resultsHTML`, `mountContent`, `renderResults`,
                  `loadProjects`, `openProjectForm`, `deleteRetestFlow`
  drawer.js       NEW — `openProject`, `renderDrawer`, `drawerHTML`, `tabBody`,
                  `retestHTML`, `bindDrawer`, `closeDrawer`, `openRetestForm`,
                  `openTeamForm`, `openNotesForm`
  admin.js        NEW — `adminHTML`, `bindAdmin`, client/application/sub-app CRUD
                  (14 fns), import flows for clients and sub apps
  devices.js      NEW — `devicesHTML`…`bindDeviceRows` (28 fns), device import
  info.js         NEW — `infoHTML`…`bindInfo`, table editor (18 fns)
  directory.js    NEW — `directoryHTML`…`bindDirectory` (9 fns)
  team.js         NEW — `teamHTML`…`openAssignMenu`, availability menus, board (24 fns)
  properties.js   NEW — `propertiesHTML`…`afterPropertiesChanged` (8 fns)
  users.js        NEW — `usersHTML`…`openUserImport`, hierarchy pickers, import parse (26 fns)
```

Rough size after the split: the largest module lands near 1000 lines (`users.js`), the
smallest near 150. `app.js` drops from 9110 to roughly 120.

## Order of work — one module per task, each independently verifiable

Never move two areas in one commit, and never move an area whose page you have not
re-loaded in the browser. Order is by risk, lowest first, so a mistake is cheap to find:

1. `state.js` + `shared.js` — the foundation. Everything else imports from here, so this
   must land first and must be pure code motion.
2. `properties.js`, `directory.js`, `admin.js` — smallest, self-contained, no cross-page state.
3. `info.js`, `devices.js` — large but isolated; the two drag-and-drop implementations.
4. `team.js`, `users.js` — large, and `users.js` holds the import parser (the only code with
   non-trivial pure logic, and therefore the only part worth unit-testing directly).
5. `projects.js`, `drawer.js` — the core flow, and the pages every other feature hangs off.
6. `auth.js`, `shell.js` — the frame around everything; moving these last means a broken
   login screen cannot block the other nine commits.
7. `app.js` — reduce to entry point; delete anything now unused.

After step 7 and only then: drop `'unsafe-inline'` from `style-src` if the inline styles were
converted, since that conversion is what unblocks it.

## Code style

Code moves; names do not change. `export` is added to the definition and `import` to the
caller — nothing else in the body is touched.

```js
// public/js/directory.js
import { h, ... } from './shared.js';
import { state } from './state.js';

export function directoryHTML() { /* body moved verbatim from app.js */ }
```

```js
// public/js/app.js — the whole file, after step 7
import { boot } from './shell.js';
import './projects.js';  // side-effect: registers the page painters
boot();
```

**Rule for `state`:** it is imported, never re-declared, and never reassigned wholesale
(`state = {}` would break every other module's binding). Mutating its fields is fine and
already how the app works.

## Testing strategy

- **Mechanical gate, run per commit:** `node --check` on every file in `public/js/`.
- **Behaviour gate, run per commit:** rebuild the container, load every page in the browser
  as `admin` and as a plain Member, open one modal per page, and confirm an empty console.
  A pure code move that changes behaviour shows up as a missing function on the first page
  that needs it — that is exactly what this pass catches.
- **Regression gate:** `npm test` (35 cases) must stay green. It tests the server and will
  not catch a client break, which is why the browser pass is mandatory and not optional.
- **Cheap addition worth taking:** the import parser (`parseImport`, `parseClientImport`,
  `parseDeviceImport`, `splitImportLine`, `usernameFor`, `freeUsername`) is pure
  string→object logic with no DOM. Once it lives in `users.js`/`admin.js` it can be imported
  by a Node test directly. Add 4–6 cases there — it is the one place a silent break would not
  be visible on screen.

## Boundaries

**Always**
- One module per commit; commit message names the area and states "code motion only".
- Verify that the **live container file matches local** (`md5sum`) before believing a browser
  result — the app has served a stale `.js` after a rebuild before.
- Keep `public/index.html` to a single module entry point.
- Run the browser pass in **both** themes and at 430px width for the pages that have layouts
  (`projects`, `devices`, `team`, `info`).

**Ask first**
- Changing `public/index.html` beyond the script tag.
- Introducing any bundler, transpiler, or new runtime dependency.
- Renaming a CSS class, element id, `data-*` attribute, or API route.
- Merging any two of the modules above because they "seem related".

**Never**
- `Network.clearBrowserCookies` or any profile-wide CDP command.
- Deleting a function because it looks unused — confirm with `grep` across `public/` first,
  and if it is genuinely dead, delete it in its **own** commit.
- Combining the split with a behaviour change, a fix, or a rename.
- Ending a session with a half-moved module: if a commit is not verified, revert it rather
  than leaving `app.js` importing a file that does not export what it needs.

## Success criteria

1. `public/js/app.js` is under 150 lines and contains no page rendering logic.
2. Every module in the target structure exists; `node --check` passes on all of them.
3. Every page loads and every modal opens, as `admin` and as `bagas` (Member), in dark and
   light themes, with **zero console errors** — verified in the running container, live file
   md5 equal to local.
4. `npm test` passes (35 + any new parser cases).
5. No CSS class, element id, `data-*` attribute or API route appears in the diff except as
   moved text inside a `class=`/`id=`/`data-` string that is byte-identical.
6. `git log` shows one commit per module, each independently revertible.

## Open questions

1. **Is a 12-module split the right granularity, or too fine?** Fewer files (say 5) means
   less import bookkeeping; more files means each one stays readable. **I propose the
   layout above because it is derived from the page structure the nav already defines**,
   so a reader looking for "the devices page" has exactly one guess.
2. **Should `state` become several smaller stores per module?** That is the actual fix for
   "everything closes over one object", but it is a behaviour-risk change disguised as
   tidying, and it would make the browser pass much harder to trust. **I propose keeping one
   shared `state` and treating a per-module store split as a separate, later decision.**
3. **Does this need to land in 11 commits, or may related small modules share a commit?**
   **I propose one commit per module, no exceptions** — the whole value is that a regression
   points at one file.
4. **`users.js` at ~1000 lines is still large.** Split the import wizard out into
   `users-import.js`? **I propose yes, if it exceeds 900 lines when moved** — decided by
   measurement, not in advance.
