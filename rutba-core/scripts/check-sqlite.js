'use strict';

/**
 * Proves the SQLite branch of dbConfig() actually opens, and that the
 * transaction helper in src/db/connection.js behaves under it. Run:
 *
 *   npm --prefix rutba-core run check:sqlite
 *
 * Why this exists as a checked-in script rather than a one-off: the offline
 * bridge in docs/todo/offline-pos-options.md is "rutba-core run against local
 * SQLite", and the part most likely to break quietly is not the driver
 * resolving — it is withTransaction(). SQLite takes a database-wide write
 * lock, so the pool is pinned to a single connection (see sqliteConfig in
 * src/config/env.js). That makes the AsyncLocalStorage plumbing load-bearing
 * in a way it never was under MySQL: a nested withTransaction() that opened a
 * *second* transaction instead of joining the ambient one would not raise an
 * error, it would sit waiting for a connection that cannot be released until
 * it returns. This walks that path deliberately.
 *
 * What it does NOT do is run the real schema. The schema registry was
 * validated byte-exact against MySQL and SQLite's type affinity differs; see
 * the divergences listed at the bottom of this file.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Must be set before anything calls get(): src/config/env.js caches the
// resolved variable set on first read. RUTBA_CORE__ rather than a bare name
// because the repo-root .env files win over process.env for the same key, and
// they already define POS_STRAPI__DATABASE_CLIENT.
const dbFile = path.join(os.tmpdir(), `rutba-core-sqlite-check-${process.pid}.sqlite`);
process.env.RUTBA_CORE__DATABASE_CLIENT = 'sqlite';
process.env.RUTBA_CORE__DATABASE_FILENAME = dbFile;

const { dbConfig } = require('../src/config/env');
const { getDb, withTransaction, closeDb } = require('../src/db/connection');

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok   ${name}`); }
  catch (e) { failed += 1; console.log(`  FAIL ${name} :: ${e && e.message}`); }
}

async function main() {
  console.log(`sqlite file: ${dbFile}\n`);

  await check('dbConfig() returns the file-path shape, not host/port', () => {
    const cfg = dbConfig();
    assert.strictEqual(cfg.client, 'better-sqlite3');
    assert.strictEqual(cfg.connection.filename, dbFile);
    assert.strictEqual(cfg.useNullAsDefault, true);
    assert.strictEqual(cfg.connection.host, undefined, 'a file has no host');
    assert.strictEqual(cfg.connection.port, undefined, 'a file has no port');
    assert.strictEqual(cfg.pool.max, 1, 'SQLite serializes writers');
  });

  await check('the driver resolves and a connection opens', async () => {
    const rows = await getDb().raw('select 1 as one');
    // better-sqlite3 returns plain rows, no MySQL-style [rows, fields] tuple.
    const row = Array.isArray(rows) ? rows[0] : rows;
    assert.strictEqual(row.one, 1);
  });

  await check('the database file lands on disk', () => {
    assert.ok(fs.existsSync(dbFile), `expected ${dbFile} to exist`);
  });

  await check('a missing parent directory is created, not left to CANTOPEN', () => {
    // The default path lives under .data/, which will not exist on a fresh
    // machine, and better-sqlite3 reports that as a bare SQLITE_CANTOPEN with
    // nothing pointing at the real cause. env.js caches its resolved variable
    // set on first read, so this needs a clean copy of the module to see a
    // different filename — the cached original keeps serving the connection
    // the checks above and below are using.
    const root = path.join(os.tmpdir(), `rutba-core-nested-${process.pid}`);
    const nested = path.join(root, 'deep', 'x.sqlite');
    fs.rmSync(root, { recursive: true, force: true });
    assert.ok(!fs.existsSync(path.dirname(nested)), 'precondition: the directory must be absent');

    process.env.RUTBA_CORE__DATABASE_FILENAME = nested;
    delete require.cache[require.resolve('../src/config/env')];
    const cfg = require('../src/config/env').dbConfig();

    assert.strictEqual(cfg.connection.filename, nested);
    assert.ok(fs.existsSync(path.dirname(nested)), 'sqliteConfig() should have created it');

    fs.rmSync(root, { recursive: true, force: true });
    process.env.RUTBA_CORE__DATABASE_FILENAME = dbFile;
    delete require.cache[require.resolve('../src/config/env')];
  });

  await check(':memory: is passed through without being treated as a path', () => {
    process.env.RUTBA_CORE__DATABASE_FILENAME = ':memory:';
    delete require.cache[require.resolve('../src/config/env')];
    const cfg = require('../src/config/env').dbConfig();
    assert.strictEqual(cfg.connection.filename, ':memory:');

    process.env.RUTBA_CORE__DATABASE_FILENAME = dbFile;
    delete require.cache[require.resolve('../src/config/env')];
  });

  await check('schema DDL runs (a table can be created)', async () => {
    await getDb().schema.dropTableIfExists('t_check');
    await getDb().schema.createTable('t_check', (t) => {
      t.increments('id');
      t.string('name');
      t.decimal('amount', 10, 2);
    });
    assert.ok(await getDb().schema.hasTable('t_check'));
  });

  await check('withTransaction commits', async () => {
    await withTransaction(async (trx) => {
      await trx('t_check').insert({ name: 'committed', amount: 1.5 });
    });
    const rows = await getDb()('t_check').where({ name: 'committed' });
    assert.strictEqual(rows.length, 1);
  });

  await check('withTransaction rolls back on throw', async () => {
    await assert.rejects(() => withTransaction(async (trx) => {
      await trx('t_check').insert({ name: 'rolled-back', amount: 2 });
      throw new Error('deliberate');
    }), /deliberate/);
    const rows = await getDb()('t_check').where({ name: 'rolled-back' });
    assert.strictEqual(rows.length, 0, 'the insert should not have survived');
  });

  await check('getDb() inside a transaction returns the ambient trx', async () => {
    // The deadlock check. With pool.max = 1 the transaction holds the only
    // connection; if getDb() asked the pool for another this would hang until
    // acquireTimeoutMillis rather than fail fast.
    await withTransaction(async (trx) => {
      const ambient = getDb();
      assert.strictEqual(ambient, trx, 'AsyncLocalStorage did not surface the transaction');
      await ambient('t_check').insert({ name: 'via-getDb', amount: 3 });
    });
    const rows = await getDb()('t_check').where({ name: 'via-getDb' });
    assert.strictEqual(rows.length, 1);
  });

  await check('nested withTransaction joins rather than nesting', async () => {
    await withTransaction(async (outer) => {
      await withTransaction(async (inner) => {
        assert.strictEqual(inner, outer, 'the inner call opened a second transaction');
        await inner('t_check').insert({ name: 'nested', amount: 4 });
      });
    });
    const rows = await getDb()('t_check').where({ name: 'nested' });
    assert.strictEqual(rows.length, 1);
  });

  await check('a nested throw rolls the whole thing back', async () => {
    await assert.rejects(() => withTransaction(async (outer) => {
      await outer('t_check').insert({ name: 'outer-part', amount: 5 });
      await withTransaction(async (inner) => {
        await inner('t_check').insert({ name: 'inner-part', amount: 6 });
        throw new Error('inner blew up');
      });
    }), /inner blew up/);
    const rows = await getDb()('t_check').whereIn('name', ['outer-part', 'inner-part']);
    assert.strictEqual(rows.length, 0, 'a join, not a savepoint — both halves must go');
  });

  await check('closeDb() releases the file', async () => {
    await getDb().schema.dropTableIfExists('t_check');
    await closeDb();
    fs.rmSync(dbFile, { force: true });
    assert.ok(!fs.existsSync(dbFile));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

// ---------------------------------------------------------------------------
// Known divergences from MySQL, deliberately NOT worked around here.
// These are the reasons this script stops at "a connection opens and
// transactions behave" rather than claiming SQLite parity:
//
//   1. DECIMAL columns. The MySQL config asks mysql2 for `decimalNumbers` and
//      `dateStrings: ['DATE']` to match Strapi's serialization exactly.
//      SQLite has no DECIMAL type — affinity turns it into REAL, so money
//      values come back as floats. Anything comparing totals across the two
//      will disagree in the last places.
//   2. DATE / DATETIME columns. Stored as TEXT or NUMERIC depending on how
//      they were written; there is no server-side type to read them back as
//      yyyy-mm-dd, so the dateStrings guarantee does not carry over.
//   3. Foreign keys are OFF by default in SQLite and are left off here.
//      Turning them on is a per-connection PRAGMA and would change insert
//      ordering requirements the MySQL schema never had to satisfy.
//   4. The schema registry itself has not been run. It was validated
//      byte-exact against MySQL; column types, AUTO_INCREMENT, enum and JSON
//      handling all differ, and migrations are the place to resolve that.
//   5. Concurrency. The pool is one connection wide, so queries that would
//      have run alongside an open transaction under MySQL now queue behind
//      it. Correct for a single-till bridge and the reason the transaction
//      checks above pass; wrong for anything expecting parallel reads, which
//      would see them serialize and — if the caller has lost the
//      AsyncLocalStorage context — fail on acquireTimeoutMillis.
// ---------------------------------------------------------------------------
