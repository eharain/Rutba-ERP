'use strict';

/**
 * `/health` and `/version` (portal task E4).
 *
 * The control plane provisions, suspends and migrates instances without a human
 * watching, so it needs two machine-readable answers: *is this instance able to
 * serve* and *what exactly is it running*. Those are different questions and
 * they get different endpoints, because a deploy checker that polls a liveness
 * probe to find out whether the new version is live gets a 200 from the old one.
 *
 * `/health` is a READINESS check, and it is honest about the difference:
 *
 *   200 ok        the database answers and the schema is current
 *   503 degraded  reachable but not fit to serve — pending migrations, or a
 *                 database that will not answer
 *
 * A health check that only proves the process is listening tells you nothing a
 * TCP connect does not. The database round-trip is the point: an instance whose
 * per-org database has been detached is exactly the failure the control plane
 * needs to see, and it is invisible from the outside otherwise.
 *
 * It is deliberately UNAUTHENTICATED and deliberately says almost nothing:
 * status, version, uptime, and per-check ok/fail. No host names, no database
 * name, no error strings from the driver — a probe endpoint is reachable from
 * wherever the load balancer is, and driver errors carry connection details.
 * The reason for a failure goes to the log, where it is already privileged.
 */

const { getDb } = require('../db/connection');
const { status: migrationStatus } = require('./migrations');

/** A slow database is a failed check, not a hung probe. */
const CHECK_TIMEOUT_MS = 3000;
const STARTED_AT = Date.now();

let cachedVersion = null;

/**
 * The build identity. `RUTBA_BUILD_*` are stamped by the image build; the
 * package version is the fallback so a bare `node src/index.js` still answers
 * something true rather than "unknown".
 */
function version() {
  if (cachedVersion) return cachedVersion;
  let pkgVersion = null;
  try {
    pkgVersion = require('../../package.json').version || null;
  } catch { /* not fatal — the endpoint still answers */ }

  cachedVersion = Object.freeze({
    service: 'services/core',
    version: process.env.RUTBA_BUILD_VERSION || pkgVersion || 'unknown',
    commit: process.env.RUTBA_BUILD_COMMIT || null,
    builtAt: process.env.RUTBA_BUILD_TIME || null,
    node: process.version,
  });
  return cachedVersion;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// `db` is injectable for one reason: the failure path is the half that matters
// and it has to be testable. A health check nobody has watched fail is a health
// check nobody has verified — and this one's contract includes *not* leaking
// the driver's error text, which you cannot assert without producing one.
async function checkDatabase(db) {
  await withTimeout((db || getDb()).raw('select 1'), CHECK_TIMEOUT_MS, 'database check');
  return { ok: true };
}

async function checkSchema() {
  const report = await withTimeout(migrationStatus(), CHECK_TIMEOUT_MS, 'schema check');
  if (report.drift.length) return { ok: false, reason: 'drift' };
  if (report.pending.length) return { ok: false, reason: 'pending', pending: report.pending.length };
  return { ok: true };
}

/**
 * Run the checks. Never throws: a health endpoint that 500s on its own bug
 * reports "the instance is broken" for the wrong reason, which is the one thing
 * a probe must not do.
 */
async function health({ log = console, db = null } = {}) {
  const checks = {};
  let healthy = true;

  for (const [name, fn] of [['database', () => checkDatabase(db)], ['schema', checkSchema]]) {
    try {
      checks[name] = await fn();
    } catch (error) {
      // The reason is logged, not returned. See the docblock.
      log.error(`[health] ${name} check failed: ${error.message}`);
      checks[name] = { ok: false, reason: 'error' };
    }
    if (!checks[name].ok) healthy = false;
  }

  return {
    healthy,
    body: {
      status: healthy ? 'ok' : 'degraded',
      ...version(),
      uptimeMs: Date.now() - STARTED_AT,
      checks,
    },
  };
}

module.exports = { health, version, STARTED_AT, CHECK_TIMEOUT_MS };
