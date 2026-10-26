# OneProMag — rules for agents working in this repo

## Never destroy browser or user data to get a clean state

- **Never call `Network.clearBrowserCookies`** (or any CDP command that clears
  cookies, site data, localStorage, history, saved passwords or profile files).
  `browser-harness` drives the operator's real Chrome profile, so a
  profile-wide clear logs them out of every site — and Chrome's cookie DB uses
  `secure_delete=ON`, which means the rows are zeroed on disk and cannot be
  recovered.
- To verify a signed-out state: call the app's own `POST /api/auth/logout`, or
  use a throwaway browser profile
  (`--user-data-dir=/tmp/opm-verify --remote-debugging-port=<port>`).
- Same class of rule for this project's data: `docker compose down -v`, deleting
  a `pgdata`/`onepromag-*` volume, `git reset --hard`, and `git push --force` all
  destroy work. Name the exact command and what it deletes, and get an explicit
  yes for that specific action.

## Docker: stop the old stack first — never move the port

A `Bind for 0.0.0.0:3131 failed: port is already allocated` is never solved by
changing `APP_PORT`, editing the published port, or starting a second stack. The
port is what the operator's bookmarks, the README and `http://localhost:3131`
point at. Fix the conflict, not the configuration.

Before every `docker compose ... up --build -d`:

1. See who owns the port:
   `ss -ltnp | grep ':3131'` and `docker ps --format '{{.Names}}\t{{.Ports}}'`.
2. Stop that stack — with its own file **and project name** if it was started
   with one:
   `docker compose -f docker-compose.prod.yml down` (prod, project `onepromag-prod`)
   `docker compose down` (dev, project `onepromag`).
3. If it will not go down, force it — still without touching volumes:
   `docker compose -p <project> -f <file> down --remove-orphans`, then
   `docker rm -f <container>` for anything left behind.
4. Bring it up again on the same port:
   `docker compose -f <file> up -d --build --force-recreate`.
5. Verify before claiming anything works: `docker compose -f <file> ps` shows
   `healthy`, `curl -fsS http://localhost:3131/healthz` answers
   `{"ok":true,"db":"ok",...}`.

`docker compose down -v` stays forbidden without explicit approval — stopping a
stack is not permission to delete its data.

## Working agreements

- Production runs from `docker-compose.prod.yml` (own project `onepromag-prod`,
  own volumes). It seeds no demo data, closes registration, and prints the admin
  login on every start — do not reintroduce fixtures or open registration there.
- Development runs from `docker-compose.yml` (`SEED_DEMO=1`, registration open).
  Both files publish 3131 on purpose: only one stack runs at a time, so stop the
  other one instead of giving it another port.
- Tables in this app share one markup (`.dev-table`); do not invent a second
  table style.
- Verify UI changes in the running container and check for console errors before
  calling them done.
