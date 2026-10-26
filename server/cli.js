#!/usr/bin/env node
/**
 * Operational commands that need the database but not the web server.
 *
 * The production stack creates its first admin with a generated password that is
 * printed once in the boot log. Logs get lost — a container that was rebuilt, a
 * `docker compose logs` read a day later, a terminal that scrolled. Without a way
 * back in, the only recovery would be deleting the volume, so this exists:
 *
 *   node server/cli.js users                     who exists
 *   node server/cli.js passwd <username>         reset a password
 *
 * In Docker:
 *
 *   docker compose -f docker-compose.prod.yml exec onepromag node server/cli.js users
 *   docker compose -f docker-compose.prod.yml exec \
 *     -e NEW_PASSWORD='…' onepromag node server/cli.js passwd admin
 *
 * The password is taken from NEW_PASSWORD; with no value one is generated and
 * printed, which is convenient when the operator just needs in and will change it
 * from the UI anyway. Resetting also drops that account's other sessions, exactly
 * like changing the password from the profile does — a reset is usually a
 * response to "someone else may have my password".
 */
import crypto from 'node:crypto';
import {
  initDatabase,
  db,
  hashPassword,
  rememberBootstrapAdmin,
  forgetBootstrapAdmin,
} from './db.js';

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.log(`OneProMag CLI

  users                       list accounts (id, username, name, role, subrole)
  passwd <username>           reset a password (NEW_PASSWORD=… or generated)
`);
}

async function listUsers() {
  const rows = await db.all(
    'SELECT id, username, name, role, subrole, email, phone FROM users ORDER BY id'
  );
  if (!rows.length) {
    console.log('No accounts. Start the app once to bootstrap an admin.');
    return;
  }
  const width = (value, size) => String(value ?? '').padEnd(size).slice(0, size);
  console.log(
    `${width('ID', 4)}${width('USERNAME', 14)}${width('NAME', 22)}${width('ROLE', 14)}${width('LEVEL', 10)}CONTACT`
  );
  for (const row of rows) {
    console.log(
      `${width(row.id, 4)}${width(row.username, 14)}${width(row.name, 22)}${width(row.role, 14)}${width(
        row.subrole || '-',
        10
      )}${row.email || row.phone || ''}`
    );
  }
}

async function resetPassword(username) {
  const wanted = String(username || '').trim().toLowerCase();
  if (!wanted) {
    console.error('Which account? Try: passwd admin');
    process.exitCode = 1;
    return;
  }
  // Usernames are stored lower-case; emails are accepted too, since that is how
  // people log in when they forget which username they were given.
  const user = await db.get(
    'SELECT id, username, name FROM users WHERE lower(username) = ? OR lower(email) = ?',
    [wanted, wanted]
  );
  if (!user) {
    console.error(`No account matches "${wanted}".`);
    process.exitCode = 1;
    return;
  }

  const given = String(process.env.NEW_PASSWORD || '').trim();
  if (given && given.length < 6) {
    console.error('NEW_PASSWORD must be at least 6 characters.');
    process.exitCode = 1;
    return;
  }
  const password = given || crypto.randomBytes(9).toString('base64url');

  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), user.id]);
  const dropped = await db.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
  // Keep the boot log honest: it reprints the password only while that password
  // is still the one in the database. A password the operator typed is not
  // remembered (it is in their hands), a generated one is — otherwise restarting
  // the container would lose the only copy of it again.
  if (given) forgetBootstrapAdmin();
  else rememberBootstrapAdmin({ username: user.username, password, createdAt: new Date().toISOString() });

  console.log(`Password reset for ${user.username} (${user.name}).`);
  console.log(`  password: ${password}${given ? '  (from NEW_PASSWORD)' : '  (generated)'}`);
  console.log(`  sessions cleared: ${dropped?.changes ?? 'yes'}`);
  if (!given) console.log('  Change it after signing in — top right → Change password.');
}

async function main() {
  if (!command || command === '-h' || command === '--help' || command === 'help') {
    usage();
    return;
  }
  await initDatabase();
  if (command === 'users') await listUsers();
  else if (command === 'passwd' || command === 'password') await resetPassword(args[0]);
  else {
    console.error(`Unknown command: ${command}\n`);
    usage();
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
