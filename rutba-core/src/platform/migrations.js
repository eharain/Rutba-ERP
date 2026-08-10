'use strict';

/**
 * Core-owned SQL migration runner (helpdesk program prerequisite P7).
 *
 * rutba-core derives every table it knows about from pos-strapi's schema.json
 * files (src/schema/), and scripts/validate-schema.js asserts that derivation
 * still matches the live database. That registry stays pos-strapi-owned until a
 * module is ready to hand its tables over. Helpdesk is the first module to do
 * that, so its NEW tables need a mechanism the registry cannot provide — this
 * one. Tables created here are deliberately invisible to the schema registry,
 * to documents() and to Strapi admin; repositories on them use knex directly.
 *
 * Migrations NEVER run at boot — src/index.js does not require this file. Core
 * shares a database with a live pos-strapi, so a schema change is an explicit,
 * operator-timed act: `node scripts/migrate.js up`.
 *
 * Three constraints shape everything below.
 *
 * 1. MySQL implicitly commits on every DDL statement. Each migration is wrapped
 *    in withTransaction(), but on MySQL that wrapper only really protects DML:
 *    a migration that fails after its second CREATE TABLE leaves the first one
 *    behind, and because the bookkeeping insert never lands it will be re-run
 *    from the top. The hasTable/hasColumn guards each migration is required to
 *    carry are therefore the actual recovery mechanism, not a style rule.
 *
 * 2. Checksums are taken over LF-normalized contents. Git's autocrlf rewrites
 *    line endings on checkout, so hashing raw bytes would report drift on every
 *    Windows machine for files nobody had touched.
 *
 * 3. A migration that has already been applied is frozen. If its file changes,
 *    the runner refuses to do anything until a human resolves it. Quietly
 *    tolerating an edited applied migration is precisely how dev, the LAN box
 *    and live end up with three different schemas that all claim to be at the
 *    same version.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb, withTransaction } = require('../db/connection');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');
const TABLE = 'core_migrations';

function hashContents(contents) {
  return crypto
    .createHash('sha256')
    .update(contents.replace(/\r\n/g, '\n'), 'utf8')
    .digest('hex');
}

function loadMigration(file) {
  const full = path.join(MIGRATIONS_DIR, file);
  const name = file.replace(/\.js$/, '');
  let mod;
  try {
    mod = require(full);
  } catch (err) {
    throw new Error(`migration ${file} failed to load: ${err.message}`);
  }
  if (!mod || typeof mod.up !== 'function') {
    throw new Error(`migration ${file} must export an async up(knex)`);
  }
  if (mod.name && mod.name !== name) {
    throw new Error(
      `migration ${file} declares name '${mod.name}' but is recorded under its filename ` +
      `'${name}' — make them equal, or one edit to the filename silently re-applies it`
    );
  }
  if (mod.down !== null && typeof mod.down !== 'function') {
    throw new Error(
      `migration ${file} must export an async down(knex), or 'down: null' with a comment ` +
      'saying why it is one-way'
    );
  }
  return {
    name,
    file,
    up: mod.up,
    down: typeof mod.down === 'function' ? mod.down : null,
    checksum: hashContents(fs.readFileSync(full, 'utf8')),
  };
}

/**
 * Every migration file, in apply order. Filenames carry a zero-padded ordinal,
 * so byte order is apply order — that is the whole reason for the padding.
 * Loading here rather than lazily means `status` and `--dry-run` validate the
 * shape of every file without touching the database.
 */
function discover() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js') && !f.startsWith('.') && !f.startsWith('_'))
    .sort()
    .map(loadMigration);
}

async function ensureTable() {
  const db = getDb();
  if (await db.schema.hasTable(TABLE)) return;
  await db.schema.createTable(TABLE, (t) => {
    t.increments('id').primary();
    // 191 keeps the unique index inside MySQL's utf8mb4 key-length limit.
    t.string('name', 191).notNullable().unique();
    t.dateTime('applied_at').notNullable();
    t.string('checksum', 64).notNullable();
  });
  console.log(`[migrate] created ${TABLE}`);
}

/** Applied rows, oldest first. Absent table means nothing has ever been applied. */
async function readApplied() {
  const db = getDb();
  if (!(await db.schema.hasTable(TABLE))) return [];
  return db(TABLE).select('id', 'name', 'applied_at', 'checksum').orderBy('id', 'asc');
}

function detectDrift(files, applied) {
  const byName = new Map(files.map((m) => [m.name, m]));
  const drift = [];
  for (const row of applied) {
    const file = byName.get(row.name);
    if (!file) {
      drift.push({
        name: row.name,
        reason: 'recorded as applied but its file no longer exists',
      });
    } else if (file.checksum !== row.checksum) {
      drift.push({
        name: row.name,
        reason:
          `file changed after it was applied (recorded ${row.checksum.slice(0, 12)}, ` +
          `now ${file.checksum.slice(0, 12)})`,
      });
    }
  }
  return drift;
}

function assertNoDrift(drift) {
  if (!drift.length) return;
  const lines = drift.map((d) => `  ${d.name} — ${d.reason}`).join('\n');
  throw new Error(
    `refusing to run: ${drift.length} applied migration(s) no longer match what was applied\n` +
    `${lines}\n` +
    'Restore the file to the state it was applied in and express the change as a NEW ' +
    `migration, or — only if you are certain this database never ran it — fix the ${TABLE} row.`
  );
}

/** { files, applied, pending, drift }. Read-only: never creates the tracking table. */
async function status() {
  const files = discover();
  const applied = await readApplied();
  const appliedNames = new Set(applied.map((r) => r.name));
  return {
    files,
    applied,
    pending: files.filter((f) => !appliedNames.has(f.name)),
    drift: detectDrift(files, applied),
  };
}

/**
 * Apply pending migrations in filename order, each in its own transaction.
 * `name` stops after that migration (everything before it still runs — skipping
 * ahead would apply 003 against a schema 002 never built).
 */
async function up(options = {}) {
  const { pending, drift } = await status();
  assertNoDrift(drift);

  let plan = pending;
  if (options.name) {
    const idx = pending.findIndex((m) => m.name === options.name);
    if (idx === -1) {
      throw new Error(
        `no pending migration named '${options.name}' — it is either already applied or does not exist`
      );
    }
    plan = pending.slice(0, idx + 1);
  }

  if (!plan.length) {
    console.log('[migrate] nothing pending');
    return [];
  }
  if (options.dryRun) {
    console.log(`[migrate] DRY RUN — would apply ${plan.length} migration(s), nothing written:`);
    for (const m of plan) console.log(`  up   ${m.name}`);
    return plan.map((m) => m.name);
  }

  await ensureTable();
  const done = [];
  for (const m of plan) {
    const t0 = Date.now();
    await withTransaction(async (trx) => {
      await m.up(trx);
      await getDb()(TABLE).insert({
        name: m.name,
        checksum: m.checksum,
        applied_at: new Date(),
      });
    });
    console.log(`[migrate] up ${m.name} ok in ${Date.now() - t0}ms`);
    done.push(m.name);
  }
  return done;
}

/** Roll back the most recently applied migration, or the named one. */
async function down(options = {}) {
  const { files, applied, drift } = await status();
  assertNoDrift(drift);

  if (!applied.length) {
    console.log('[migrate] nothing applied');
    return null;
  }
  const target = options.name
    ? applied.find((r) => r.name === options.name)
    : applied[applied.length - 1];
  if (!target) {
    throw new Error(`'${options.name}' is not applied on this database — nothing to roll back`);
  }

  const migration = files.find((f) => f.name === target.name);
  if (!migration.down) {
    throw new Error(
      `${migration.name} declares 'down: null' — it is one-way and will not be rolled back. ` +
      'Reverse it with a new forward migration.'
    );
  }

  const newer = applied.slice(applied.indexOf(target) + 1).map((r) => r.name);
  if (newer.length) {
    console.log(
      `[migrate] WARNING: out-of-order rollback — ${newer.join(', ')} ` +
      `were applied after ${migration.name} and stay applied`
    );
  }
  if (options.dryRun) {
    console.log(`[migrate] DRY RUN — would roll back ${migration.name}, nothing written`);
    return migration.name;
  }

  const t0 = Date.now();
  await withTransaction(async (trx) => {
    await migration.down(trx);
    await getDb()(TABLE).where({ name: migration.name }).delete();
  });
  console.log(`[migrate] down ${migration.name} ok in ${Date.now() - t0}ms`);
  return migration.name;
}

module.exports = { MIGRATIONS_DIR, TABLE, discover, status, up, down };
