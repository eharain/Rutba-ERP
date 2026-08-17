#!/usr/bin/env node
'use strict';

/**
 * Seed the api-pro policy tables from the descriptor contract — without Strapi.
 *
 * Usage:
 *   node scripts/seed-policy.js                 apply what differs
 *   node scripts/seed-policy.js --dry-run       print the plan, write nothing
 *   node scripts/seed-policy.js --verbose       list every changed row
 *   node scripts/seed-policy.js --prune         also delete rows no descriptor
 *                                               declares any more
 *   node scripts/seed-policy.js --force         write even when nothing differs
 *
 * Like every other core script this prints the target database first: these
 * tables ARE the route table and the permission model, and seeding the live
 * database because ENVIRONMENT was not what you assumed is a bad afternoon.
 *
 * Exit codes: 0 clean (or a dry run with no drift), 1 on failure, and
 * 2 on `--dry-run` when the plan is non-empty — so CI can gate "the committed
 * descriptors match the seeded tables" without a second tool.
 */

const { buildRegistry } = require('../src/schema/registry');
const { planSeed, applySeed } = require('../src/policy/seeder');
const checkpoint = require('../src/policy/checkpoint');
const { getDb, closeDb } = require('../src/db/connection');

function parseArgs(argv) {
  const out = { dryRun: false, verbose: false, prune: false, force: false };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--verbose' || arg === '-v') out.verbose = true;
    else if (arg === '--prune') out.prune = true;
    else if (arg === '--force') out.force = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return out;
}

const SECTIONS = ['domains', 'roles', 'interfaces', 'methods', 'policies'];

function printPlan(plan, { verbose }) {
  console.log(`[policy] contract: ${plan.contract.files} descriptor files, `
    + `${plan.contract.descriptors.length} endpoints`
    + (plan.contract.aliases ? `, ${plan.contract.aliases} alias(es) skipped` : ''));
  console.log(`[policy] fingerprint: ${plan.contract.fingerprint.slice(0, 16)}`);

  for (const name of SECTIONS) {
    const s = plan.sections[name];
    const link = plan.linkDiffs[name];
    const bits = [
      `${plan.counts[name]} desired`,
      `+${s.inserts.length}`,
      `~${s.updates.length}`,
      `stale ${s.stale.length}`,
    ];
    if (link) bits.push(`links +${link.adds.length}/-${link.removes.length}`);
    console.log(`  ${name.padEnd(11)} ${bits.join('  ')}`);

    if (!verbose) continue;
    for (const r of s.inserts) console.log(`      + ${r.key}`);
    for (const u of s.updates) {
      console.log(`      ~ ${u.key}  [${Object.keys(u.changed).join(', ')}]`);
    }
    for (const r of s.stale) console.log(`      ? ${r.key} (stale)`);
  }
}

function printStaleHint(plan) {
  if (!plan.totals.stale) return;
  console.log(`[policy] ${plan.totals.stale} row(s) no descriptor declares any more.`);
  console.log('[policy] Core builds its route table from these rows, so a stale row mounts a');
  console.log('[policy] route the contract does not define. Re-run with --prune to remove them.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[policy] database: ${getDb().client.config.connection.database}`);

  const registry = buildRegistry();
  const plan = await planSeed({ registry });

  printPlan(plan, args);

  if (args.dryRun) {
    printStaleHint(plan);
    if (!plan.dirty) {
      console.log('[policy] dry run: seeded tables already match the contract.');
      return 0;
    }
    console.log(`[policy] dry run: ${plan.totals.inserts} insert(s), ${plan.totals.updates} update(s), `
      + `${plan.totals.linkAdds} link(s) to add, ${plan.totals.linkRemoves} to remove — nothing written.`);
    return 2;
  }

  if (!plan.dirty && !args.force && !(args.prune && plan.totals.stale)) {
    console.log('[policy] up to date — nothing to write.');
    printStaleHint(plan);
    return 0;
  }

  await applySeed(plan, { prune: args.prune });
  if (!args.prune) printStaleHint(plan);

  // Record the run, so the next boot takes the fast path instead of walking
  // 178 descriptor modules to rediscover what this command just settled.
  await checkpoint.write({
    fingerprint: plan.contract.fingerprint,
    counts: await checkpoint.countRows(),
    summary: {
      ...plan.counts,
      descriptorsScanned: plan.contract.descriptors.length,
      stale: args.prune ? 0 : plan.totals.stale,
      via: 'cli',
    },
  });
  return 0;
}

main()
  .then(async (code) => { await closeDb(); process.exit(code); })
  .catch(async (err) => {
    console.error(`[policy] failed: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    try { await closeDb(); } catch { /* already closing */ }
    process.exit(1);
  });
