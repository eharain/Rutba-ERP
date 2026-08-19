'use strict';

/**
 * Runs `migrateOnBoot` once and prints its result as JSON.
 *
 * A separate process on purpose: core's config snapshots `process.env` the
 * first time anything reads it, so `RUTBA_CORE_MIGRATE_ON_BOOT` can only be
 * exercised the way a container actually sets it — in the environment the
 * process starts with. Mutating it in-process would test nothing.
 */

const { migrateOnBoot } = require('../../src/platform/boot-migrate');
const { closeDb } = require('../../src/db/connection');

const quiet = { log() {}, warn() {}, error() {} };

migrateOnBoot({ log: quiet })
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
