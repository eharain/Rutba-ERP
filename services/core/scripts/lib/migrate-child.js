'use strict';

/**
 * The sandboxed half of the migrations-on-boot smoke: runs `migrateOnBoot`
 * once against a THROWAWAY database and a THROWAWAY migration set, prints the
 * target, then prints its result as JSON.
 *
 * A separate process on purpose, for two reasons.
 *
 * 1. Core's config snapshots `process.env` the first time anything reads it,
 *    so `RUTBA_CORE_MIGRATE_ON_BOOT` can only be exercised the way a container
 *    actually sets it — in the environment the process starts with. Mutating
 *    it in-process would test nothing.
 *
 * 2. It lets the sandbox be established BEFORE `src/config/env.js` resolves
 *    anything. `migrateOnBoot` applies pending DDL; run in the smoke's own
 *    process it would apply it to whatever the repo-root .env resolves to. On
 *    2026-08-20 that was the dev database, harmlessly. On a machine whose
 *    .env points at the LAN box or live it would not have been, and nothing
 *    would have asked first.
 *
 * The sandbox is MANDATORY and this file fails closed. Both variables must be
 * set, and the resolved connection is re-checked against them after env.js has
 * had its say — because .env files win over process.env for the same key
 * (env.js `loadVars`), so a future `CORE__DATABASE_CLIENT` in .env would
 * silently dissolve the sandbox and put MySQL back in the line of fire. Better
 * to exit REFUSED and fail the smoke than to migrate a database nobody named.
 *
 *   RUTBA_SMOKE_DB_FILE          throwaway SQLite file to create and migrate
 *   RUTBA_SMOKE_MIGRATIONS_DIR   throwaway migration set to apply
 *
 * Exit codes are load-bearing — the smoke asserts on them:
 *   0  migrateOnBoot returned; its result is the last JSON line on stdout
 *   1  migrateOnBoot threw (a migration failed, or it refused to boot)
 *   2  REFUSED: no sandbox, or the sandbox did not take
 */

/** Distinct from 1 so "it refused" is never mistaken for "the migration failed". */
const REFUSED = 2;

function refuse(message) {
  console.error(`[smoke] REFUSED: ${message}`);
  process.exit(REFUSED);
}

const dbFile = process.env.RUTBA_SMOKE_DB_FILE;
const migrationsDir = process.env.RUTBA_SMOKE_MIGRATIONS_DIR;

if (!dbFile || !migrationsDir) {
  refuse(
    'RUTBA_SMOKE_DB_FILE and RUTBA_SMOKE_MIGRATIONS_DIR must both be set. This runner applies '
    + 'pending migrations, so it will not fall back to the ambient database.'
  );
}

// Before any require that might read config. `CORE__` rather than a bare name:
// the repo-root .env files win over process.env for the same key, and they
// already define POS_STRAPI__DATABASE_CLIENT. Same reasoning as
// scripts/check-sqlite.js.
process.env.CORE__DATABASE_CLIENT = 'sqlite';
process.env.CORE__DATABASE_FILENAME = dbFile;

const { dbConfig } = require('../../src/config/env');
const { migrateOnBoot } = require('../../src/platform/boot-migrate');
const { closeDb } = require('../../src/db/connection');
const { describeConfig } = require('./db-target');
const { sandboxRefusal } = require('./migrate-sandbox');

// The check that makes the sandbox a guarantee rather than an intention. It
// runs AFTER env.js has resolved, so it sees what the connection will really
// be rather than what we asked for. The predicate lives in its own file so the
// smoke can assert it directly — see migrate-sandbox.js.
const resolved = dbConfig();
const refusal = sandboxRefusal(resolved, dbFile);
if (refusal) refuse(refusal);

// Same line scripts/migrate.js prints, for the same reason: say what is about
// to be mutated before mutating it. Here it is proof the target is disposable.
console.log(`[smoke] migrating: ${describeConfig(resolved)}`);
console.log(`[smoke] migration set: ${migrationsDir}`);

const quiet = { log() {}, warn() {}, error() {} };

migrateOnBoot({ log: quiet, dir: migrationsDir })
  .then(async (result) => {
    console.log(JSON.stringify(result));
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error.message);
    try { await closeDb(); } catch { /* ignore */ }
    process.exit(1);
  });
