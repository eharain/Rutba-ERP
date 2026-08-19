#!/usr/bin/env node
'use strict';

/**
 * CLI for the Core-owned migration runner (src/platform/migrations.js).
 *
 * Usage:
 *   node scripts/migrate.js status
 *   node scripts/migrate.js up            [--name=<migration>] [--dry-run]
 *   node scripts/migrate.js down          [--name=<migration>] [--dry-run]
 *
 * Every command prints the target database first. Core reads the repo-root
 * .env itself (src/config/env.js), so the same command run from a different
 * shell can point at a different database — and applying helpdesk DDL to the
 * live database because ENVIRONMENT was not what you assumed is the one
 * mistake this tool cannot undo.
 *
 * Exit codes: 0 clean, 1 refused or failed (drift, one-way rollback, bad
 * usage, a throwing migration). `status` exits 1 on drift so CI can gate on it.
 */

const { status, up, down } = require('../src/platform/migrations');
const { getDb, closeDb } = require('../src/db/connection');
const { describeTarget } = require('./lib/db-target');

function parseArgs(argv) {
  const out = { command: null, name: null, dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--name=')) out.name = arg.slice('--name='.length);
    else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
    else if (!out.command) out.command = arg;
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!out.command) out.command = 'status';
  if (!['status', 'up', 'down'].includes(out.command)) {
    throw new Error(`unknown command '${out.command}' — expected status, up or down`);
  }
  if (out.name === '') throw new Error('--name= needs a migration name');
  return out;
}

function printStatus(report) {
  console.log(`[migrate] applied: ${report.applied.length}`);
  for (const row of report.applied) {
    const at = row.applied_at instanceof Date ? row.applied_at.toISOString() : String(row.applied_at);
    console.log(`  applied  ${row.name}  (${at})`);
  }
  console.log(`[migrate] pending: ${report.pending.length}`);
  for (const m of report.pending) console.log(`  pending  ${m.name}`);
  if (report.drift.length) {
    console.log(`[migrate] DRIFT: ${report.drift.length}`);
    for (const d of report.drift) console.log(`  drift    ${d.name} — ${d.reason}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // The name alone is not enough to tell you where you are: dev, the LAN box
  // and live all call it pos_db on 127.0.0.1. ENVIRONMENT is the part that
  // discriminates, because it picks the .env file the credentials come from.
  console.log(`[migrate] database: ${describeTarget(getDb())}`);

  if (args.command === 'status') {
    const report = await status();
    printStatus(report);
    await closeDb();
    process.exit(report.drift.length ? 1 : 0);
  }

  if (args.command === 'up') await up({ name: args.name, dryRun: args.dryRun });
  else await down({ name: args.name, dryRun: args.dryRun });

  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(`[migrate] failed: ${err.message}`);
  await closeDb();
  process.exit(1);
});
