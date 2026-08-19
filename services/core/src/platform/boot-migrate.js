'use strict';

/**
 * Migrations on boot (portal task E4).
 *
 * A provisionable instance brings its own schema up to date when it starts.
 * The alternative — an out-of-band `npm run migrate` step — is a manual gate in
 * a flow the control plane is supposed to be able to run unattended, and it is
 * the step that gets forgotten when an org is restored or moved.
 *
 * Four rules, each one a way this goes wrong in production:
 *
 * 1. **One instance migrates, the rest wait.** Held under an advisory lock, so
 *    a rolling deploy or a scaled replica set cannot have two processes
 *    applying the same DDL. Whoever loses the lock waits for the winner and
 *    then verifies, rather than assuming.
 *
 * 2. **A failed migration fails the boot.** Serving traffic against a schema
 *    that is half-migrated is worse than not serving: the errors are data
 *    errors, and they are shaped like application bugs.
 *
 * 3. **A loser that still sees pending work fails too.** If the winner crashed
 *    mid-way, the loser must not shrug and serve. It re-reads status after the
 *    wait and treats anything still pending as a failed boot.
 *
 * 4. **Drift refuses rather than repairs.** `up()` already throws when an
 *    applied migration's checksum no longer matches its file. On boot that
 *    means someone edited a migration that has already run somewhere — the one
 *    situation where continuing quietly is how two environments end up with
 *    different schemas under the same version number.
 */

const { status, up } = require('./migrations');
const { withAdvisoryLock } = require('./advisory-lock');
const { get } = require('../config/env');

const LOCK_NAME = 'rutba_core_migrations';
/** Long enough for a real migration set, short enough that a wedged holder is visible. */
const LOCK_TIMEOUT_MS = 120000;

function enabled() {
  const raw = String(get('RUTBA_CORE_MIGRATE_ON_BOOT', '1')).toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

/**
 * Bring the schema up to date, or refuse to boot.
 *
 * Returns `{ ran, applied, waited, skipped }`. Throws on anything that leaves
 * the schema not-current — the caller is expected to let that kill the process.
 */
async function migrateOnBoot({ log = console } = {}) {
  if (!enabled()) {
    log.log('[migrate] on-boot migration disabled (RUTBA_CORE_MIGRATE_ON_BOOT=0)');
    return { ran: false, applied: [], waited: false, skipped: 'disabled' };
  }

  const before = await status();
  if (before.drift.length) {
    // Rule 4. Say which ones, because the fix depends on whether the edit was
    // intentional (write a new migration) or accidental (restore the file).
    const names = before.drift.map((d) => d.name).join(', ');
    throw new Error(
      `[migrate] refusing to boot: ${before.drift.length} applied migration(s) no longer match their file `
      + `(${names}). An applied migration is history — add a new one instead of editing it.`
    );
  }
  if (!before.pending.length) {
    log.log('[migrate] schema is current');
    return { ran: false, applied: [], waited: false, skipped: 'nothing-pending' };
  }

  log.log(`[migrate] ${before.pending.length} pending: ${before.pending.map((m) => m.name).join(', ')}`);

  const outcome = await withAdvisoryLock(LOCK_NAME, async () => {
    // Re-read inside the lock: the pending list from before the wait may have
    // been applied by whoever held it.
    const inside = await status();
    if (!inside.pending.length) return { applied: [], note: 'another instance applied them' };
    return { applied: await up(), note: null };
  }, { timeoutMs: LOCK_TIMEOUT_MS });

  if (!outcome.acquired) {
    // Rule 3: we waited out the whole timeout and never got in. The holder may
    // have finished anyway, so check the schema rather than the lock.
    log.warn(`[migrate] could not take the migration lock within ${LOCK_TIMEOUT_MS}ms — checking whether another instance finished the work`);
    const after = await status();
    if (after.pending.length) {
      throw new Error(
        `[migrate] refusing to boot: ${after.pending.length} migration(s) still pending and the migration lock is `
        + 'held by another process. Either it is still running (retry) or it died mid-way (investigate before restarting).'
      );
    }
    log.log('[migrate] another instance brought the schema up to date');
    return { ran: false, applied: [], waited: true, skipped: 'applied-elsewhere' };
  }

  const applied = outcome.result.applied || [];
  if (outcome.result.note) log.log(`[migrate] ${outcome.result.note}`);
  if (outcome.skipped === 'sqlite-single-process') {
    log.log('[migrate] sqlite: no cross-process lock taken (single-process by design)');
  }

  // Rule 2 is mostly `up()` throwing, but a partial apply that somehow returned
  // is still a boot we must not complete.
  const after = await status();
  if (after.pending.length) {
    throw new Error(
      `[migrate] refusing to boot: ${after.pending.length} migration(s) still pending after applying `
      + `${applied.length}. The schema is not what this build expects.`
    );
  }

  if (applied.length) log.log(`[migrate] applied ${applied.length}: ${applied.join(', ')}`);
  return { ran: applied.length > 0, applied, waited: false, skipped: null };
}

module.exports = { migrateOnBoot, LOCK_NAME, LOCK_TIMEOUT_MS, enabled };
