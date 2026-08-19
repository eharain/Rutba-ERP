'use strict';

/**
 * A cross-process lock, for the things exactly one instance may do at a time.
 *
 * The reason this exists is migrations on boot. In a container world a rolling
 * deploy starts the new instance before the old one is gone, and a scaled
 * deployment starts several at once — so "run pending migrations at startup"
 * means *n* processes reading the same empty pending list and all deciding to
 * apply it. MySQL DDL is not transactional, so the runner's per-migration
 * transaction does not save us: the second `CREATE TABLE` fails, that boot
 * dies, and the supervisor restarts it into the same race.
 *
 * The lock is held on ONE pinned connection, which is the whole subtlety.
 * `GET_LOCK` and `RELEASE_LOCK` are per-session, and knex hands out pooled
 * connections per query — so acquiring on one and releasing on another would
 * leave the lock held until that connection is recycled, which on an idle pool
 * can be a very long time.
 *
 * Dialects:
 *
 *   mysql     GET_LOCK / RELEASE_LOCK, session-scoped, name capped at 64 chars.
 *   postgres  pg_try_advisory_lock over a 64-bit hash of the name, polled.
 *   sqlite    NOT LOCKED, and it says so rather than pretending. A SQLite
 *             deployment is the single-process desktop replica; there is no
 *             second instance to race, and a fake lock that returns "acquired"
 *             would be worse than a documented gap.
 */

const crypto = require('crypto');
const { getDb } = require('../db/connection');

const DEFAULT_TIMEOUT_MS = 30000;
const POLL_MS = 250;
/** MySQL caps lock names at 64 characters and errors above it, rather than truncating. */
const MYSQL_NAME_MAX = 64;

function dialectOf(db) {
  return (db.client && db.client.dialect) || 'unknown';
}

/** A stable signed 64-bit key for Postgres, derived from the same name MySQL uses. */
function pgKey(name) {
  const digest = crypto.createHash('sha1').update(name).digest();
  return digest.readBigInt64BE(0).toString();
}

async function run(db, conn, sql, bindings) {
  const res = await db.client.query(conn, { sql, bindings, method: 'first' });
  return db.client.processResponse(res, undefined);
}

/**
 * Hold `name` for the duration of `fn`.
 *
 * Returns `{ acquired, skipped, dialect, result }`. It does NOT throw when the
 * lock is unavailable — a boot that lost the race to another instance has not
 * failed, it has simply been beaten to the work, and `acquired: false` lets the
 * caller wait for the winner rather than crash.
 *
 * `fn` throwing DOES propagate, after the lock is released.
 */
async function withAdvisoryLock(name, fn, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const db = getDb();
  const dialect = dialectOf(db);

  if (dialect === 'sqlite3' || dialect === 'better-sqlite3') {
    // Stated, not silent. See the docblock.
    return { acquired: true, skipped: 'sqlite-single-process', dialect, result: await fn() };
  }

  if (name.length > MYSQL_NAME_MAX) {
    throw new Error(`advisory-lock: name '${name}' exceeds ${MYSQL_NAME_MAX} characters`);
  }

  const conn = await db.client.acquireConnection();
  let held = false;
  try {
    if (dialect === 'mysql') {
      // GET_LOCK's own timeout does the waiting, in whole seconds; round UP so
      // a sub-second request still waits rather than becoming a bare try-lock.
      const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
      const row = await run(db, conn, 'SELECT GET_LOCK(?, ?) AS got', [name, seconds]);
      // 1 acquired, 0 timed out, NULL an error (e.g. the connection died).
      held = row && Number(row.got) === 1;
    } else if (dialect === 'postgresql' || dialect === 'pg') {
      const key = pgKey(name);
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const row = await run(db, conn, 'SELECT pg_try_advisory_lock(?) AS got', [key]);
        if (row && (row.got === true || row.got === 't')) { held = true; break; }
        if (Date.now() >= deadline) break;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } else {
      throw new Error(`advisory-lock: no implementation for dialect '${dialect}'`);
    }

    if (!held) return { acquired: false, dialect, result: undefined };
    return { acquired: true, dialect, result: await fn() };
  } finally {
    if (held) {
      try {
        if (dialect === 'mysql') await run(db, conn, 'SELECT RELEASE_LOCK(?) AS freed', [name]);
        else await run(db, conn, 'SELECT pg_advisory_unlock(?) AS freed', [pgKey(name)]);
      } catch (error) {
        // Losing the release is survivable — the lock dies with the session —
        // but it must never mask the caller's own error.
        console.error(`[lock] failed to release '${name}': ${error.message}`);
      }
    }
    await db.client.releaseConnection(conn);
  }
}

module.exports = { withAdvisoryLock, pgKey, DEFAULT_TIMEOUT_MS };
