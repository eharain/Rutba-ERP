#!/usr/bin/env node
'use strict';

/**
 * Smoke for instance packaging (portal task E4): the probe endpoints, the
 * advisory lock, and migrations on boot.
 *
 * The lock is the part worth testing for real. Its whole purpose is a race
 * between processes, and a single-process test of a cross-process lock proves
 * nothing — so this forks a second Node process and has both try to hold it at
 * once. Everything else here is cheap by comparison.
 *
 *   node scripts/smoke-packaging.js
 */

const { fork } = require('child_process');
const path = require('path');
const { getDb, closeDb } = require('../src/db/connection');
const { withAdvisoryLock, pgKey } = require('../src/platform/advisory-lock');
const { health, version } = require('../src/platform/health');
const { migrateOnBoot } = require('../src/platform/boot-migrate');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name} :: ${error.message}`);
    if (process.env.VERBOSE) console.log(error.stack);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

/** The child half of the concurrency test: hold the lock, report, hold on. */
const CHILD = path.join(__dirname, 'lib', 'lock-child.js');
const MIGRATE_CHILD = path.join(__dirname, 'lib', 'migrate-child.js');

/** Run migrateOnBoot in a fresh process with `env` merged into its environment. */
function runChildJson(env) {
  return new Promise((resolve, reject) => {
    const child = fork(MIGRATE_CHILD, [], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`child exited ${code}: ${out.trim()}`));
      const line = out.trim().split(/\r?\n/).filter((l) => l.startsWith('{')).pop();
      if (!line) return reject(new Error(`child printed no JSON: ${out.trim()}`));
      try { resolve(JSON.parse(line)); } catch (e) { reject(new Error(`bad JSON from child: ${line}`)); }
    });
    child.on('error', reject);
  });
}

function holdLockInChild(name, holdMs) {
  return new Promise((resolve, reject) => {
    const child = fork(CHILD, [name, String(holdMs)], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('child never reported holding the lock'));
    }, 20000);
    child.on('message', (msg) => {
      if (msg && msg.holding && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`child exited early (${code})`)); }
    });
  });
}

(async () => {
  console.log('\nprobe endpoints');

  await test('version() reports a service, a version and the node runtime', () => {
    const v = version();
    assert(v.service === 'services/core', `service was ${v.service}`);
    assert(typeof v.version === 'string' && v.version.length > 0, 'no version');
    assert(v.node === process.version, 'node version mismatch');
  });

  await test('version() leaks no host, database or credential', () => {
    const text = JSON.stringify(version()).toLowerCase();
    for (const secret of ['password', 'database_', 'localhost', 'mysql://', '@']) {
      assert(!text.includes(secret), `version() contained "${secret}"`);
    }
  });

  await test('health() is 200 with the database up and the schema current', async () => {
    const { healthy, body } = await health();
    assert(healthy === true, `unhealthy: ${JSON.stringify(body.checks)}`);
    assert(body.status === 'ok', `status was ${body.status}`);
    assert(body.checks.database.ok === true, 'database check failed');
    assert(body.checks.schema.ok === true, 'schema check failed');
    assert(typeof body.uptimeMs === 'number', 'no uptime');
  });

  await test('health() reports failure without leaking the driver error', async () => {
    // A health endpoint is reachable from wherever the load balancer is, so a
    // failing check must not hand out connection strings.
    // `log` is the console-shaped object health() calls .error() on, not a
    // function — the reason for a failed check goes to the log, never to the
    // response body.
    const quiet = { log() {}, error() {} };
    const dead = { raw: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.7:3306 user=root password=hunter2')) };
    const { healthy, body } = await health({ log: quiet, db: dead });
    assert(healthy === false, 'a dead database reported healthy');
    assert(body.status === 'degraded', `status was ${body.status}`);
    assert(body.checks.database.ok === false, 'database check passed with a dead database');
    const text = JSON.stringify(body);
    assert(!text.includes('ECONNREFUSED'), 'leaked the driver error');
    assert(!text.includes('hunter2'), 'leaked a credential');
    assert(!text.includes('10.0.0.7'), 'leaked a host');
  });

  console.log('\nadvisory lock');

  await test('the lock is taken and released, and the callback result comes back', async () => {
    const out = await withAdvisoryLock('rutba_smoke_lock_a', async () => 'done');
    assert(out.acquired === true, 'not acquired');
    assert(out.result === 'done', `result was ${out.result}`);
  });

  await test('the same name is free again immediately after', async () => {
    const out = await withAdvisoryLock('rutba_smoke_lock_a', async () => 'again');
    assert(out.acquired === true, 'lock was not released by the previous holder');
  });

  await test('a SECOND PROCESS holding it makes us wait, then give up cleanly', async () => {
    const name = 'rutba_smoke_lock_x';
    const child = await holdLockInChild(name, 6000);
    try {
      const t0 = Date.now();
      const out = await withAdvisoryLock(name, async () => 'should not run', { timeoutMs: 1000 });
      const waited = Date.now() - t0;
      assert(out.acquired === false, 'took a lock another process was holding');
      assert(out.result === undefined, 'ran the callback without the lock');
      // It must actually WAIT rather than fail fast — a rolling deploy needs
      // the loser to give the winner time.
      assert(waited >= 900, `returned after only ${waited}ms — it did not wait`);
    } finally {
      child.kill();
    }
  });

  await test('the lock is reusable once the other process is gone', async () => {
    const name = 'rutba_smoke_lock_x';
    // The child is killed above; MySQL frees a session lock when the session
    // dies, so this proves the release path does not depend on a clean exit.
    const out = await withAdvisoryLock(name, async () => 'free', { timeoutMs: 5000 });
    assert(out.acquired === true, 'lock stayed held after the holder died');
  });

  await test('a throwing callback still releases the lock', async () => {
    const name = 'rutba_smoke_lock_b';
    await withAdvisoryLock(name, async () => { throw new Error('boom'); })
      .then(() => { throw new Error('the error was swallowed'); })
      .catch((e) => { if (e.message !== 'boom') throw e; });
    const out = await withAdvisoryLock(name, async () => 'ok', { timeoutMs: 2000 });
    assert(out.acquired === true, 'a thrown error leaked the lock');
  });

  await test('a name longer than MySQL allows is refused, not truncated', async () => {
    await withAdvisoryLock('x'.repeat(65), async () => 'no')
      .then(() => { throw new Error('accepted an over-long lock name'); })
      .catch((e) => { if (!/exceeds 64/.test(e.message)) throw e; });
  });

  await test('the Postgres key derivation is stable and fits a signed bigint', () => {
    const a = pgKey('rutba_core_migrations');
    const b = pgKey('rutba_core_migrations');
    assert(a === b, 'not deterministic');
    assert(a !== pgKey('something_else'), 'collides with a different name');
    const n = BigInt(a);
    assert(n >= -(2n ** 63n) && n < 2n ** 63n, `out of range: ${a}`);
  });

  console.log('\nmigrations on boot');

  await test('a current schema is a no-op that says so', async () => {
    const quiet = { log: () => {}, warn: () => {}, error: () => {} };
    const out = await migrateOnBoot({ log: quiet });
    assert(out.ran === false, 'applied something against a current schema');
    assert(out.skipped === 'nothing-pending', `skipped was ${out.skipped}`);
  });

  await test('it can be switched off for out-of-band pipelines', async () => {
    // Run in a CHILD with the variable in its real environment. Core's config
    // snapshots process.env on first read, so setting it in-process here would
    // exercise a path production never takes — and would pass for the wrong
    // reason if the switch were broken. This is how a container sets it.
    const out = await runChildJson({ RUTBA_CORE_MIGRATE_ON_BOOT: '0' });
    assert(out.skipped === 'disabled', `skipped was ${out.skipped}`);
  });

  await test('and it is ON by default, without the variable set', async () => {
    const out = await runChildJson({});
    assert(out.skipped !== 'disabled', 'on-boot migration defaulted to off');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await closeDb();
  process.exit(failed ? 1 : 0);
})().catch(async (error) => {
  console.error('ERR', error.stack || error.message);
  try { await closeDb(); } catch { /* ignore */ }
  process.exit(1);
});
