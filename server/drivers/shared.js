/**
 * Query adapter shared by both drivers.
 *
 * Every query in this app is written with `?` placeholders so a single SQL
 * string works on SQLite and PostgreSQL. The Postgres driver rewrites them to
 * `$1..$n` on the way in. None of our statements contain a literal `?`, so a
 * naive positional rewrite is safe here.
 */

export function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** Strip undefined -> null so pg doesn't choke on non-JSON values. */
export function normalizeParams(params) {
  if (!params) return [];
  return params.map((p) => (p === undefined ? null : p));
}

/**
 * Serialises async work onto a single connection. SQLite transactions share one
 * connection, so two concurrent BEGINs would interleave; this promise chain
 * forces them to run one after another.
 */
export function createLock() {
  let tail = Promise.resolve();
  return function withLock(fn) {
    const run = tail.then(fn, fn);
    // Keep the chain alive even when a caller's transaction rejects.
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
