/**
 * PostgreSQL driver — wraps a `pg` Pool in the same async surface as the SQLite
 * driver. Placeholders are `?` in application code and rewritten to `$n` here.
 *
 * Transactions take a dedicated client from the pool so all statements in one
 * transaction run on the same backend session.
 */
import pg from 'pg';
import { toPgPlaceholders, normalizeParams } from './shared.js';

// pg returns BIGINT/COUNT as strings. Every counter in this app is small, so
// parse them back to numbers to keep the JSON contract identical to SQLite.
pg.types.setTypeParser(20, (value) => Number(value)); // int8 / COUNT(*)

export function createPostgresDriver({ connectionString, host, port, user, password, database, max = 10 }) {
  const pool = new pg.Pool(
    connectionString
      ? { connectionString, max }
      : { host, port, user, password, database, max }
  );

  // A pool error (e.g. the server restarting) must not crash the process.
  pool.on('error', (err) => {
    console.error('[db] idle client error:', err.message);
  });

  function wrap(client) {
    return {
      async exec(sql) {
        await client.query(sql);
      },
      async all(sql, params = []) {
        const { rows } = await client.query(toPgPlaceholders(sql), normalizeParams(params));
        return rows;
      },
      async get(sql, params = []) {
        const { rows } = await client.query(toPgPlaceholders(sql), normalizeParams(params));
        return rows[0] ?? null;
      },
      async run(sql, params = []) {
        const { rows, rowCount } = await client.query(
          toPgPlaceholders(sql),
          normalizeParams(params)
        );
        return { rowCount: rowCount ?? 0, lastInsertId: rows[0]?.id };
      },
    };
  }

  const poolApi = wrap(pool);

  return {
    engine: 'postgres',
    ...poolApi,
    // Appended to a SELECT inside a transaction to serialise writers on that
    // row (used by retest code generation so two requests cannot read the same
    // max sequence number).
    rowLock: ' FOR UPDATE',

    async transaction(fn) {
      const client = await pool.connect();
      const tx = wrap(client);
      try {
        await client.query('BEGIN');
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* connection may already be gone */
        }
        throw err;
      } finally {
        client.release();
      }
    },

    /** Retries the initial connection so compose can start app and db together. */
    async waitUntilReady({ attempts = 30, delayMs = 1000 } = {}) {
      for (let i = 1; i <= attempts; i += 1) {
        try {
          await pool.query('SELECT 1');
          return true;
        } catch (err) {
          if (i === attempts) throw err;
          console.error(`[db] waiting for postgres (${i}/${attempts}) — ${err.message}`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      return false;
    },

    async close() {
      await pool.end();
    },
  };
}
