import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './api.js';
import { initDatabase, db } from './db.js';
import {
  HttpError,
  currentUser,
  login,
  createSession,
  destroySession,
  sessionCookie,
  clearCookie,
  parseCookies,
  createUser,
  listUsers,
  changePassword,
  updateOwnContact,
  destroyOtherSessions,
} from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3131);
const HOST = process.env.HOST || '0.0.0.0';
const IS_DOCKER = fs.existsSync('/.dockerenv');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJSON(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

async function readBody(req, limit = 1024 * 512) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Payload too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

function matchRoute(method, pathname) {
  const key = `${method} ${pathname}`;
  if (api[key]) return { handler: api[key], params: {} };

  for (const route of Object.keys(api)) {
    const [rMethod, rPath] = route.split(' ');
    if (rMethod !== method || !rPath.includes(':')) continue;
    const rParts = rPath.split('/');
    const pParts = pathname.split('/');
    if (rParts.length !== pParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < rParts.length; i += 1) {
      if (rParts[i].startsWith(':')) params[rParts[i].slice(1)] = decodeURIComponent(pParts[i]);
      else if (rParts[i] !== pParts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { handler: api[route], params };
  }
  return null;
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) throw new Error('dir');
    const ext = path.extname(filePath).toLowerCase();
    // Assets are revalidated on EVERY load instead of being trusted for 5
    // minutes. A plain max-age meant a rebuilt container kept serving the old
    // JS to anyone who reloaded, because index.html came back fresh (no-store)
    // while every <script> was answered from cache — the app looked completely
    // unchanged after a deploy. An mtime+size ETag makes the revalidation a
    // cheap 304 in the normal case, so this costs nothing when nothing changed.
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const cacheControl = ext === '.html' ? 'no-store' : 'no-cache';
    if (ext !== '.html' && req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl });
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': cacheControl,
      ...(ext === '.html' ? {} : { ETag: etag }),
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    if (!path.extname(pathname)) {
      // SPA fallback
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      const stat = await fsp.stat(indexPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  try {
    // ---- health ----------------------------------------------------------
    // Readiness, not just liveness: the answer includes a database round trip,
    // because a web server that cannot read its database serves nothing but
    // errors. The wait is capped at two seconds so a wedged connection pool
    // reports "down" instead of hanging the probe until Docker's own timeout
    // kills it — a slow answer and a failed answer should not look the same.
    if (pathname === '/healthz') {
      const dbOk = await Promise.race([
        db.get('SELECT 1 AS ok').then(
          () => true,
          () => false,
        ),
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 2000);
          timer.unref?.();
        }),
      ]);
      return sendJSON(res, dbOk ? 200 : 503, {
        ok: dbOk,
        db: dbOk ? 'ok' : 'down',
        uptime: Math.round(process.uptime()),
      });
    }

    // ---- auth endpoints -------------------------------------------------
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await readBody(req);
      // The identifier may be a username or an email; login() decides which and
      // throws when a shared email makes the choice ambiguous.
      const user = await login(body.username, body.password);
      if (!user) return sendJSON(res, 401, { error: 'Invalid username or password' });
      const { token, expires } = await createSession(user.id);
      return sendJSON(res, 200, { user }, { 'Set-Cookie': sessionCookie(token, expires, req) });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const token = parseCookies(req).opm_session;
      await destroySession(token);
      return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(req) });
    }

    if (pathname === '/api/auth/register' && method === 'POST') {
      const body = await readBody(req);
      // Public self-registration is an untrusted path: it may only ever create
      // an ordinary pentester. Role, sub-role and parent are never taken from
      // the request body — accepting them let anyone POST role:"Admin" and
      // then delete projects through the admin-only routes.
      const user = await createUser({
        username: body.username,
        name: body.name,
        password: body.password,
        role: 'Pentester',
        subrole: 'Member',
        phone: body.phone,
        email: body.email,
      });
      const { token, expires } = await createSession(user.id);
      return sendJSON(res, 201, { user }, { 'Set-Cookie': sessionCookie(token, expires, req) });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = await currentUser(req);
      return sendJSON(res, 200, { user });
    }

    if (pathname === '/api/auth/profile' && method === 'PATCH') {
      // Authenticated like /api/auth/password, and for the same reason: the generic
      // gate below answers a bare 401 for anything it does not know, which would
      // bury the real validation message behind a generic failure.
      const user = await currentUser(req);
      if (!user) return sendJSON(res, 401, { error: 'Not authenticated' });
      const body = await readBody(req);
      const updated = await updateOwnContact(user.id, {
        phone: body.phone,
        email: body.email,
      });
      return sendJSON(res, 200, { user: updated });
    }

    if (pathname === '/api/auth/password' && method === 'POST') {
      // Authenticated, but deliberately NOT under the generic auth gate below:
      // the gate answers with a bare 401 JSON for anything unrecognised, which
      // would hide the real validation messages (wrong current password, too
      // short, unchanged) behind a generic failure.
      const user = await currentUser(req);
      if (!user) return sendJSON(res, 401, { error: 'Not authenticated' });
      const body = await readBody(req);
      await changePassword(user.id, body.currentPassword, body.newPassword);
      // Evict every other browser holding a session for this account, keep the
      // one making the request so the user is not logged out mid-action.
      await destroyOtherSessions(user.id, parseCookies(req).opm_session);
      return sendJSON(res, 200, { ok: true });
    }

    // ---- everything under /api requires auth ----------------------------
    if (pathname.startsWith('/api/')) {
      const user = await currentUser(req);
      if (!user) return sendJSON(res, 401, { error: 'Not authenticated' });

      const route = matchRoute(method, pathname);
      if (!route) return sendJSON(res, 404, { error: 'Endpoint not found' });

      const isMutation = method !== 'GET';
      const body = isMutation ? await readBody(req) : null;
      const result = await route.handler({
        user,
        params: route.params,
        query: Object.fromEntries(url.searchParams),
        body,
      });
      return sendJSON(res, isMutation ? 201 : 200, result);
    }

    // ---- static assets --------------------------------------------------
    if (method === 'GET' || method === 'HEAD') return serveStatic(req, res, pathname);

    res.writeHead(405, { 'Content-Type': 'text/plain' }).end('Method not allowed');
  } catch (err) {
    if (err instanceof HttpError) return sendJSON(res, err.status, { error: err.message });
    console.error(err);
    return sendJSON(res, 500, { error: 'Internal server error' });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error(`  Try another port:  PORT=${PORT + 1} npm start\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

// Boot sequence: prepare the database BEFORE accepting traffic, so the first
// request never races schema creation or seeding.
const info = await initDatabase();

server.listen(PORT, HOST, () => {
  console.log(`\n  OneProMag running → http://localhost:${PORT}\n`);
  console.log(`  Database       → ${info.engine}${info.engine === 'sqlite' ? ' (local file)' : ''}`);
  if (info.engine === 'sqlite') {
    console.log(`  Data volume    → ${process.env.DATA_DIR || './data'}`);
  }
  if (IS_DOCKER) console.log('  Logs           → docker compose logs -f');
  // The production file runs with no configuration at all on purpose, so the
  // one thing that must not pass unnoticed is the database password. The boot
  // log is where a deployment gets inspected; say it there.
  if (info.engine === 'postgres' && String(process.env.PGPASSWORD || '') === 'onepromag') {
    console.log('  Warning        → database password is still the default "onepromag"');
    console.log('                   set POSTGRES_PASSWORD in .env before exposing this');
  }
  // Demo data is a development convenience; say plainly when it is off, because
  // an empty dashboard then means "correct" and not "the seed broke".
  if (info.demo === false) {
    console.log('  Demo data      → off (SEED_DEMO=0) — schema and built-in properties only');
  }
  // The one account a demo-free install gets. Printed once, at creation: the
  // generated password is not stored anywhere readable afterwards.
  if (info.bootstrapAdmin) {
    const { username, password, generated } = info.bootstrapAdmin;
    console.log('\n  First admin:');
    console.log(`    ${username} / ${password}`);
    console.log(
      generated
        ? '    Generated password — sign in and change it (top right → Change password)'
        : '    Password taken from ADMIN_PASSWORD'
    );
  }
  // Only advertise credentials that actually exist in this database: on an
  // existing install the seed is skipped, so the demo logins would be a lie.
  if (info.demo === false) {
    // Nothing to add: the switch above already said why this database is empty.
  } else if (info.seeded) {
    console.log('  Seed           → demo data created');
    console.log('\n  Demo accounts:');
    console.log('    admin / admin123        (Admin, Lead)');
    console.log('    rafi  / pentester123    (Pentester, Lead)');
    console.log('    dewi  / pentester123    (Pentester, Sub Lead)');
    console.log('    bagas / pentester123    (Pentester, Member)');
    console.log('    sinta / pentester123    (Pentester, Member)\n');
  } else {
    console.log('  Seed           → skipped (database already has users)');
    if (info.devices?.seeded) {
      console.log(`  Devices        → demo inventory backfilled (${info.devices.devices} devices)`);
    }
    console.log('');
  }
});

// Close the database cleanly so Postgres connections are not left hanging.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log(`\n  ${signal} received, shutting down…`);
    server.close();
    try {
      await db.close();
    } finally {
      process.exit(0);
    }
  });
}
