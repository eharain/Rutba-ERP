'use strict';

/**
 * services/core's authorization policy layer.
 *
 * Today this owns the seeder that turns the descriptor contract
 * (`packages/api-provider/api/*.js`) into the `api_pro_*` tables core reads its
 * route table and its permissions from. Enforcement still runs out of
 * `packages/strapi-api-pro/server/src/services/` through the compat layer; it
 * moves here as the plugin wrapper retires (ERP 2.0 P2).
 *
 *   descriptors.js  contract → endpoint list        (no database, no Strapi)
 *   scope.js        scope shorthand → templates      (enforcement fragments)
 *   seeder.js       endpoint list ↔ tables           (diff, then write)
 *   checkpoint.js   boot fast path                   (skip the walk when clean)
 *
 * The entry point below is what core's boot calls; the CLI
 * (`scripts/seed-policy.js`) drives the same pieces with the plan printed.
 */

const { REPO_ROOT } = require('../config/env');
const { readContract, resolveApiProviderRoot, sourceFingerprint } = require('./descriptors');
const { planSeed, applySeed, seedPolicy } = require('./seeder');
const checkpoint = require('./checkpoint');

/**
 * Seed the policy tables if the contract and the tables disagree.
 *
 * Modes (env `RUTBA_CORE_POLICY_SEED`):
 *   auto   — the default: fast-path check, full diff and write when it fails
 *   off    — never seed at boot (deploys that seed as an explicit step)
 *   force  — always do the full diff, even when the checkpoint says clean
 *
 * Never throws: a core that cannot seed should still boot and serve whatever
 * the tables already hold. A backend that refuses to start because a descriptor
 * file has a syntax error is a worse failure than one serving a stale route
 * table and saying so loudly.
 */
async function ensurePolicySeed({ registry, mode, log = console } = {}) {
  const resolvedMode = String(mode || process.env.RUTBA_CORE_POLICY_SEED || 'auto').toLowerCase();
  if (resolvedMode === 'off') return { skipped: true, reason: 'RUTBA_CORE_POLICY_SEED=off' };

  try {
    const root = resolveApiProviderRoot();
    if (!root) {
      log.warn('[policy] @rutba/api-provider not resolvable — leaving the seeded tables as they are');
      return { skipped: true, reason: 'contract not resolvable' };
    }

    // Hashing ~180 files costs a few ms; importing them costs ~1.5s.
    const fingerprint = sourceFingerprint(root);
    const decision = resolvedMode === 'force'
      ? { seed: true, reason: 'forced' }
      : await checkpoint.shouldSeed(fingerprint);

    if (!decision.seed) return { skipped: true, reason: decision.reason };

    log.info(`[policy] seeding: ${decision.reason}`);
    const contract = await readContract({ registry, log });
    const plan = await planSeed({ registry, contract, log });

    if (plan.dirty) {
      await applySeed(plan, { log });
    } else {
      log.info('[policy] tables already match the contract');
    }
    if (plan.totals.stale) {
      // Not pruned automatically: these rows mount routes and grant roles, and
      // deleting them is a revocation. `npm run seed:policy -- --prune` is the
      // deliberate act — same rule the api-pro prune tooling already follows.
      log.warn(`[policy] ${plan.totals.stale} row(s) no descriptor declares any more `
        + '— run `npm --prefix services/core run seed:policy -- --prune` to remove them');
    }

    await checkpoint.write({
      fingerprint,
      counts: await checkpoint.countRows(),
      summary: {
        ...plan.counts,
        descriptorsScanned: contract.descriptors.length,
        stale: plan.totals.stale,
      },
    });

    return { skipped: false, dirty: plan.dirty, stale: plan.totals.stale };
  } catch (err) {
    log.error(`[policy] seed failed: ${err.message}`);
    return { skipped: true, error: err.message };
  }
}

module.exports = {
  ensurePolicySeed,
  readContract,
  planSeed,
  applySeed,
  seedPolicy,
  checkpoint,
  REPO_ROOT,
};
