/**
 * SQLite driver — wraps node:sqlite (DatabaseSync) in the same async surface the
 * Postgres driver exposes, so server/api.js and server/auth.js never branch on
 * the engine.
 *
 * Everything is synchronous underneath. That is fine: SQLite is a local file
 * and every statement here is sub-millisecond. Transactions are serialised with
 * a lock because all callers share one connection.
 */
import { DatabaseSync } from 'node:sqlite';
import { createLock } from './shared.js';

export function createSqliteDriver(filePath) {
  const db = new DatabaseSync(filePath);
  const withLock = createLock();
  let inTransaction = false;

  // Waits instead of failing when another connection holds the write lock. The
  // app has exactly one connection, but `docker compose` can still point a
  // second process at the same file (a CLI command while the server runs), and
  // the default of 0 turns that ordinary overlap into an instant SQLITE_BUSY.
  db.exec('PRAGMA busy_timeout = 5000');

  /** The statement itself, with no locking decision. Callers own the lock. */
  function runNow(sql, params) {
    const info = db.prepare(sql).run(...params);
    return { rowCount: Number(info.changes), lastInsertId: Number(info.lastInsertRowid) };
  }

  return {
    engine: 'sqlite',
    // SQLite serialises writers with BEGIN IMMEDIATE, so no row lock is needed.
    rowLock: '',

    async exec(sql) {
      db.exec(sql);
    },

    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },

    async get(sql, params = []) {
      return db.prepare(sql).get(...params) ?? null;
    },

    /**
     * A bare UPDATE must take the same lock as a transaction, or it can execute
     * in the middle of someone else's BEGIN IMMEDIATE and fail with SQLITE_BUSY
     * — or, worse, land between their statements and be rolled back with them.
     * Inside a transaction the lock is already held, so it is taken again only
     * outside one: waiting on a promise chain that will not resolve until this
     * very call finishes is a deadlock, not a queue.
     */
    async run(sql, params = []) {
      if (inTransaction) return runNow(sql, params);
      return withLock(() => runNow(sql, params));
    },

    /**
     * Runs fn(tx) inside BEGIN/COMMIT. fn receives the same query methods but
     * routed through the transaction. Nested calls join the outer transaction
     * instead of trying to BEGIN twice (SQLite has no nested transactions).
     */
    async transaction(fn) {
      if (inTransaction) return fn(this);
      return withLock(async () => {
        inTransaction = true;
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(this);
          db.exec('COMMIT');
          return result;
        } catch (err) {
          try {
            db.exec('ROLLBACK');
          } catch {
            /* connection may already be rolled back */
          }
          throw err;
        } finally {
          inTransaction = false;
        }
      });
    },

    async close() {
      db.close();
    },
  };
}
