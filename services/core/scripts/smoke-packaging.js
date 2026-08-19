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
 *
 * WHAT THIS TOUCHES, and why the migration section looks the way it does.
 *
 * The probe and advisory-lock checks run against the ambient connection — the
 * one src/config/env.js resolves from the repo-root .env. They only read it:
 * `select 1`, a migration-status read, and GET_LOCK/RELEASE_LOCK, which are
 * session-scoped and write no rows. The target is printed before any of it.
 *
 * The migration checks are a different matter, and used to be a live grenade.
 * `migrateOnBoot()` APPLIES PENDING DDL. Called here directly, it applied it
 * to whatever .env resolved to — on 2026-08-20 that was the dev database,
 * which silently gained `024-posting-export-queue` from a run of this file.
 * That was harmless. The same command on a box whose .env points at the LAN
 * machine or at live would have migrated it, unprompted, from something called
 * a smoke test.
 *
 * Two things were considered and rejected before the design below:
 *
 *   - Rolling the migration back afterwards. MySQL commits implicitly on DDL,
 *     so there is no transaction to roll back — src/platform/migrations.js
 *     says so in its own header.
 *   - Guarding on `ENVIRONMENT=development` AND a loopback DATABASE_HOST.
 *     The host half is worthless here: .env.production sets DATABASE_HOST to
 *     127.0.0.1 too, because live reaches MySQL locally. Loopback does not
 *     mean "not production" in this repo, and a guard that reads as though it
 *     does is worse than none.
 *
 * So the migration checks never touch the ambient database at all. Each one
 * runs in a child process pinned to a throwaway SQLite file and a throwaway
 * migration set, both created here and deleted afterwards. The real migration
 * set is not usable for this in any case: it cannot run on an empty database,
 * because 010-contact-tickets-extend extends a table Strapi owns.
 *
 * That trade is what the first check in the section defends. If the sandbox
 * ever stops taking — a `CORE__DATABASE_CLIENT` appearing in .env, a change to
 * env.js precedence — the child must exit REFUSED rather than quietly falling
 * back onto MySQL, and that is asserted rather than assumed.
 */

const { fork } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDb, closeDb } = require('../src/db/connection');
const { withAdvisoryLock, pgKey } = require('../src/platform/advisory-lock');
const { health, version } = require('../src/platform/health');
const { describeTarget } = require('./lib/db-target');
const { sandboxRefusal } = require('./lib/migrate-sandbox');

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

/** migrate-child's exit code for "no sandbox, or the sandbox did not take". */
const REFUSED = 2;

/**
 * Run migrate-child with `env` merged in, and report how it went rather than
 * throwing — several checks below are about a NON-zero exit.
 *
 * RUTBA_CORE_MIGRATE_ON_BOOT is stripped from the inherited environment first.
 * "It is on by default" is only a real assertion if the variable is genuinely
 * absent, and inheriting one from whoever launched the smoke would make that
 * check pass or fail for a reason that has nothing to do with the code.
 */
function runChild(env) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env };
    delete childEnv.RUTBA_CORE_MIGRATE_ON_BOOT;
    Object.assign(childEnv, env);

    const child = fork(MIGRATE_CHILD, [], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => {
      const line = out.trim().split(/\r?\n/).filter((l) => l.startsWith('{')).pop();
      let json = null;
      if (line) { try { json = JSON.parse(line); } catch { /* reported as absent */ } }
      resolve({ code, out: out.trim(), json });
    });
  });
}

/** Boot `box` once, insisting it succeeded. Returns the migrateOnBoot result. */
async function bootMigrate(box, env = {}) {
  const r = await runChild({
    RUTBA_SMOKE_DB_FILE: box.dbFile,
    RUTBA_SMOKE_MIGRATIONS_DIR: box.migrations,
    ...env,
  });
  if (r.code !== 0) throw new Error(`child exited ${r.code}: ${r.out}`);
  if (!r.json) throw new Error(`child printed no JSON: ${r.out}`);
  return r.json;
}

/** Boot `box` once, expecting it NOT to succeed. Returns { code, out }. */
function bootMigrateExpectingFailure(box, env = {}) {
  return runChild({
    RUTBA_SMOKE_DB_FILE: box.dbFile,
    RUTBA_SMOKE_MIGRATIONS_DIR: box.migrations,
    ...env,
  });
}

// ---------------------------------------------------------------------------
// Throwaway sandboxes: one temp directory holding a SQLite file and a
// migration set, both disposable. Every one created here is removed in the
// finally at the bottom, whether the checks pass or not.
// ---------------------------------------------------------------------------

const sandboxes = [];

function sandbox(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `rutba-smoke-${label}-`));
  const migrations = path.join(root, 'migrations');
  fs.mkdirSync(migrations);
  const box = { root, migrations, dbFile: path.join(root, 'core.sqlite') };
  sandboxes.push(box);
  return box;
}

/** A migration that creates one table, with the hasTable guard the runner requires. */
function writeTableMigration(box, name, table) {
  fs.writeFileSync(path.join(box.migrations, `${name}.js`), `'use strict';
module.exports = {
  async up(knex) {
    if (await knex.schema.hasTable('${table}')) return;
    await knex.schema.createTable('${table}', (t) => { t.increments('id'); });
  },
  async down(knex) { await knex.schema.dropTableIfExists('${table}'); },
};
`);
}

/** A migration that throws, for the "a failed migration fails the boot" rule. */
function writeThrowingMigration(box, name, message) {
  fs.writeFileSync(path.join(box.migrations, `${name}.js`), `'use strict';
module.exports = {
  async up() { throw new Error('${message}'); },
  // down: null — it never applied, so there is nothing to reverse.
  down: null,
};
`);
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
  // Say what is about to be touched, before touching it — the same thing
  // scripts/migrate.js prints, and for the same reason.
  console.log(`\n[smoke] ambient database: ${describeTarget(getDb())}`);
  console.log('[smoke] the probe and advisory-lock checks READ it and take session locks; they write no rows.');
  console.log('[smoke] the migrations-on-boot checks never touch it — see the header of this file.');

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

  console.log('\nmigrations on boot (sandboxed — throwaway SQLite, throwaway migration set)');

  // This one first, because everything after it depends on the sandbox holding.
  await test('the runner REFUSES to migrate the ambient database', async () => {
    const r = await runChild({});
    assert(r.code === REFUSED, `exited ${r.code}, expected ${REFUSED} — it did not refuse`);
    assert(/REFUSED/.test(r.out), `no refusal on its output: ${r.out}`);
    assert(r.json === null, 'it produced a migrateOnBoot result without a sandbox');
  });

  await test('a resolved connection that is not the throwaway file is refused', async () => {
    // The regression the check above cannot see: both variables ARE set, but
    // env.js resolves past them. .env files beat process.env for the same key,
    // so a CORE__DATABASE_CLIENT landing in .env one day would put MySQL back
    // under migrateOnBoot with the sandbox still apparently in place.
    //
    // That cannot be staged from a child's environment — it needs an edit to
    // the real repo-root .env — so the predicate is asserted directly here and
    // its wiring by the check above. Every one of these is a config that must
    // NOT be allowed to proceed.
    const file = path.join(os.tmpdir(), 'throwaway.sqlite');
    const rejected = [
      ['a MySQL connection', { client: 'mysql2', connection: { host: '127.0.0.1', database: 'pos_db' } }],
      ['a Postgres connection', { client: 'pg', connection: { host: '127.0.0.1', database: 'pos_db' } }],
      ['SQLite with no filename', { client: 'better-sqlite3', connection: {} }],
      ['SQLite on a different file', { client: 'better-sqlite3', connection: { filename: `${file}.other` } }],
      ['nothing at all', null],
    ];
    for (const [label, config] of rejected) {
      const reason = sandboxRefusal(config, file);
      assert(typeof reason === 'string' && reason.length > 0, `${label} was allowed through`);
    }

    // And it must still say yes to the real thing, or the guard would just be
    // an outage — every migration check below it would refuse forever.
    const ok = sandboxRefusal({ client: 'better-sqlite3', connection: { filename: file } }, file);
    assert(ok === null, `the genuine sandbox was refused: ${ok}`);
  });

  // One sandbox, booted twice: applied, then current. The second half is the
  // assertion this file used to make against the live database.
  const current = sandbox('current');
  writeTableMigration(current, '001-first', 't_one');
  writeTableMigration(current, '002-second', 't_two');

  await test('pending migrations are applied on boot, in order, and reported', async () => {
    const out = await bootMigrate(current);
    assert(out.ran === true, 'applied nothing against a pending schema');
    assert(out.skipped === null, `skipped was ${out.skipped}`);
    assert(
      out.applied.join(',') === '001-first,002-second',
      `applied ${JSON.stringify(out.applied)} — wrong set or wrong order`,
    );
  });

  await test('a current schema is a no-op that says so', async () => {
    const out = await bootMigrate(current);
    assert(out.ran === false, 'applied something against a current schema');
    assert(out.skipped === 'nothing-pending', `skipped was ${out.skipped}`);
    assert(out.applied.length === 0, `applied ${JSON.stringify(out.applied)}`);
  });

  await test('it can be switched off for out-of-band pipelines', async () => {
    // Run in a CHILD with the variable in its real environment. Core's config
    // snapshots process.env on first read, so setting it in-process here would
    // exercise a path production never takes — and would pass for the wrong
    // reason if the switch were broken. This is how a container sets it.
    const box = sandbox('disabled');
    writeTableMigration(box, '001-first', 't_one');

    const off = await bootMigrate(box, { RUTBA_CORE_MIGRATE_ON_BOOT: '0' });
    assert(off.skipped === 'disabled', `skipped was ${off.skipped}`);

    // And the switch has to mean it. Returning 'disabled' while still applying
    // the DDL is exactly the failure an out-of-band pipeline would not notice,
    // so prove the work is still pending afterwards.
    const on = await bootMigrate(box);
    assert(on.ran === true && on.applied.length === 1, 'it said "disabled" but had already applied');
  });

  await test('and it is ON by default, without the variable set', async () => {
    const box = sandbox('default');
    writeTableMigration(box, '001-first', 't_one');
    const out = await bootMigrate(box);
    assert(out.skipped !== 'disabled', 'on-boot migration defaulted to off');
    assert(out.ran === true, 'defaulted on but applied nothing');
  });

  // Rule 2 of src/platform/boot-migrate.js: serving on a half-migrated schema
  // is worse than not serving. Untestable before the sandbox — proving it
  // needed a database that could be left broken.
  const failing = sandbox('failing');
  writeTableMigration(failing, '001-first', 't_one');
  writeThrowingMigration(failing, '002-second', 'deliberate failure');

  await test('a migration that throws fails the boot instead of serving', async () => {
    const r = await bootMigrateExpectingFailure(failing);
    assert(r.code === 1, `exited ${r.code}, expected 1 — the boot survived a failed migration`);
    assert(/deliberate failure/.test(r.out), `the reason was swallowed: ${r.out}`);
  });

  await test('the failed migration is not recorded, and the one before it stays applied', async () => {
    // Replace the thrower with a working migration and boot again. If the
    // bookkeeping were wrong in either direction this reports it: re-applying
    // 001 means the first commit was lost, applying nothing means the failure
    // was recorded as a success.
    writeTableMigration(failing, '002-second', 't_two');
    const out = await bootMigrate(failing);
    assert(
      out.applied.join(',') === '002-second',
      `applied ${JSON.stringify(out.applied)} — expected only the repaired migration`,
    );
  });

  // Rule 4: an applied migration is history. Editing one is how dev, the LAN
  // box and live end up at three different schemas under one version number.
  await test('an applied migration that changed on disk refuses the boot', async () => {
    const box = sandbox('drift');
    writeTableMigration(box, '001-first', 't_one');
    await bootMigrate(box);

    fs.appendFileSync(path.join(box.migrations, '001-first.js'), '\n// edited after it was applied\n');

    const r = await bootMigrateExpectingFailure(box);
    assert(r.code === 1, `exited ${r.code}, expected 1 — it booted on a drifted migration`);
    assert(/no longer match/.test(r.out), `no drift message: ${r.out}`);
    assert(/001-first/.test(r.out), `the drift message did not name the migration: ${r.out}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await closeDb();
  cleanup();
  process.exit(failed ? 1 : 0);
})().catch(async (error) => {
  console.error('ERR', error.stack || error.message);
  try { await closeDb(); } catch { /* ignore */ }
  cleanup();
  process.exit(1);
});

function cleanup() {
  for (const box of sandboxes) {
    try { fs.rmSync(box.root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
