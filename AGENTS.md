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

## Working agreements

- Production runs from `docker-compose.prod.yml` (own project `onepromag-prod`,
  own volumes). It seeds no demo data, closes registration, and prints the admin
  login on every start — do not reintroduce fixtures or open registration there.
- Development runs from `docker-compose.yml` (`SEED_DEMO=1`, registration open).
  Only one stack can hold 3131; use `APP_PORT` for the second one.
- Tables in this app share one markup (`.dev-table`); do not invent a second
  table style.
- Verify UI changes in the running container and check for console errors before
  calling them done.
