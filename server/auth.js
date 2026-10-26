import crypto from 'node:crypto';
import { db, verifyPassword, hashPassword, ENUMS } from './db.js';

const SESSION_COOKIE = 'opm_session';
const SESSION_TTL_DAYS = 14;

export function nowISO() {
  return new Date().toISOString();
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_TTL_DAYS * 86400000);
  await db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [
    token,
    userId,
    created.toISOString(),
    expires.toISOString(),
  ]);
  return { token, expires };
}

export async function destroySession(token) {
  if (token) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

/**
 * Drop every session belonging to a user EXCEPT the current one.
 *
 * Used after a password change. Changing a password must evict anyone else who
 * is holding a live session (the whole reason to change it), but logging the
 * user out of the browser they are standing in front of would look like a
 * failure, so the current token is spared.
 */
export async function destroyOtherSessions(userId, keepToken) {
  if (keepToken) {
    await db.run('DELETE FROM sessions WHERE user_id = ? AND token <> ?', [userId, keepToken]);
  } else {
    await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  }
}

/**
 * Change a user's own password.
 *
 * The current password is required even though the caller is already
 * authenticated: an unattended browser must not be enough to lock the real
 * owner out of their account.
 */
/**
 * Lets a user edit their own contact details.
 *
 * Only phone and email are reachable here — name, role, level and reporting line
 * are decided by whoever administers the team, and a self-service form that could
 * change them would be a privilege escalation in one field. Email is normalised and
 * checked for shape, but not for uniqueness: the login path refuses an ambiguous
 * shared address rather than this form silently taking an address off a colleague.
 */
export async function updateOwnContact(userId, { phone, email }) {
  const row = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
  if (!row) throw new HttpError(404, 'User not found');
  const nextPhone = String(phone ?? '').trim().slice(0, 40);
  const nextEmail = String(email ?? '').trim().slice(0, 160);
  if (nextEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) {
    throw new HttpError(400, 'That email address does not look right');
  }
  await db.run('UPDATE users SET phone = ?, email = ? WHERE id = ?', [
    nextPhone,
    nextEmail,
    userId,
  ]);
  return getPublicUser(userId);
}

export async function changePassword(userId, currentPassword, newPassword) {
  const row = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [userId]);
  if (!row) throw new HttpError(404, 'User not found');
  if (!verifyPassword(String(currentPassword || ''), row.password_hash)) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  const next = String(newPassword || '');
  if (next.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (next === String(currentPassword)) {
    throw new HttpError(400, 'New password must be different from the current one');
  }
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(next), userId]);
  return true;
}

/**
 * `Secure` on the session cookie.
 *
 * Decided from the request, not from how someone remembered to configure it:
 * the flag is set when the request actually arrived over TLS — either directly
 * (`req.socket.encrypted`) or as seen by the reverse proxy that terminated it
 * (`X-Forwarded-Proto`). A cookie marked `Secure` that is issued over plain
 * http is dropped by the browser, which looks exactly like a broken login, so
 * guessing wrong here is not a cosmetic mistake.
 *
 * COOKIE_SECURE still overrides the guess in either direction: `1` for a setup
 * where the proxy is expected to lie about the protocol, `0` to force it off
 * (e.g. a TLS terminator that does not add the header).
 */
const COOKIE_SECURE_OVERRIDE = String(process.env.COOKIE_SECURE || '').trim();

function cookieFlags(req) {
  let secure;
  if (COOKIE_SECURE_OVERRIDE !== '') {
    secure = /^(1|true|yes|on)$/i.test(COOKIE_SECURE_OVERRIDE);
  } else {
    const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    secure = proto === 'https' || Boolean(req?.socket?.encrypted);
  }
  return `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function sessionCookie(token, expires, req) {
  return `${SESSION_COOKIE}=${token}; ${cookieFlags(req)}; Expires=${expires.toUTCString()}`;
}

export function clearCookie(req) {
  return `${SESSION_COOKIE}=; ${cookieFlags(req)}; Max-Age=0`;
}

export async function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const row = await db.get(
    `SELECT u.id, u.username, u.name, u.role, u.subrole, u.parent_id,
            u.availability, u.phone, u.email, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`,
    [token]
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    subrole: row.subrole || 'Member',
    parentId: row.parent_id ?? null,
    availability: row.availability || '',
    phone: row.phone || '',
    email: row.email || '',
  };
}

/**
 * Finds the account behind a login identifier, which may be a username or an
 * email address.
 *
 * A username always wins: usernames are unique and validated, emails are free
 * text that admins paste in, so a user literally named like someone else's email
 * must still be able to sign in as themselves. Only when no username matches is
 * the identifier treated as an email — case-insensitively, because nobody types
 * their address the same way twice.
 *
 * If an email is shared by more than one account the login is refused rather than
 * guessed: silently signing someone into the wrong account is worse than an error
 * message telling them to use their username.
 */
async function findUserByLogin(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  const byName = await db.get('SELECT * FROM users WHERE username = ?', [raw.toLowerCase()]);
  if (byName) return byName;
  if (!raw.includes('@')) return null;
  const rows = await db.all('SELECT * FROM users WHERE LOWER(email) = ?', [raw.toLowerCase()]);
  if (rows.length > 1) {
    throw new HttpError(
      409,
      'That email is used by more than one account. Sign in with your username instead.'
    );
  }
  return rows[0] || null;
}

export async function login(identifier, password) {
  let user;
  try {
    user = await findUserByLogin(identifier);
  } catch (err) {
    // A shared email is a configuration problem, not a bad password. Surface it
    // instead of the generic 401, which would send the user hunting for a typo.
    if (err instanceof HttpError) throw err;
    throw err;
  }
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    subrole: user.subrole || 'Member',
    parentId: user.parent_id ?? null,
    availability: user.availability || '',
    phone: user.phone || '',
    email: user.email || '',
  };
}

export async function createUser({ username, name, password, role, subrole, parentId, phone, email }) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
    throw new HttpError(400, 'Username must be 3-32 chars: a-z 0-9 . _ -');
  }
  if (!String(password || '').length || String(password).length < 6) {
    throw new HttpError(400, 'Password must be at least 6 characters');
  }
  const exists = await db.get('SELECT id FROM users WHERE username = ?', [cleanUsername]);
  if (exists) throw new HttpError(409, 'Username already taken');
  const row = await db.get(
    `INSERT INTO users (username, name, role, subrole, parent_id, phone, email, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      cleanUsername,
      String(name || cleanUsername).trim(),
      ENUMS.role.includes(role) ? role : 'Pentester',
      ENUMS.subrole.includes(subrole) ? subrole : 'Member',
      parentId ? Number(parentId) : null,
      String(phone || '').trim(),
      String(email || '').trim(),
      hashPassword(String(password)),
      nowISO(),
    ]
  );
  return getPublicUser(Number(row.id));
}

export async function getPublicUser(id) {
  return (
    (await db.get('SELECT id, username, name, role, subrole, parent_id, availability, availability_note, phone, email FROM users WHERE id = ?', [id])) ||
    null
  );
}

/**
 * All pentesters, ordered by hierarchy (Lead -> Sub Lead -> Member) then name.
 * The order matters: the UI renders the assignment picker directly from this.
 */
export async function listUsers() {
  const rows = await db.all(
    'SELECT id, username, name, role, subrole, parent_id, availability, availability_note, phone, email FROM users'
  );
  const rank = ENUMS.subroleRank;
  return rows.sort(
    (a, b) =>
      (rank[a.subrole] ?? 9) - (rank[b.subrole] ?? 9) ||
      String(a.name).localeCompare(String(b.name))
  );
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
