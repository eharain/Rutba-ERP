'use strict';

/**
 * THE entitlement resolver for this process.
 *
 * `createEntitlementResolver()` is deliberately a factory — it is tested by
 * building throwaway instances with injected sources and clocks. But a running
 * instance must have exactly one, and the reason is written on the factory
 * itself: the last-known-good cache and the collapsing of concurrent refreshes
 * are the whole point, and a second instance has neither of the first's answers.
 *
 * Two resolvers agree today only because the stub source is deterministic. The
 * moment a real licence client lands they are two caches with two heartbeats
 * that can disagree about whether an org is in grace — and the entitlement gate
 * and the posting router would then be enforcing different licences in the same
 * request. That is the "two answers to one question" failure this whole program
 * exists to remove, so it gets one owner here rather than one per call site.
 *
 * Tests that need isolation build their own with createEntitlementResolver().
 */

const { createEntitlementResolver } = require('./entitlements');

let instance = null;

/** The process-wide resolver, created on first use. */
function getEntitlementResolver() {
  if (!instance) instance = createEntitlementResolver();
  return instance;
}

/** Drop it — for tests, and for a config change that must not be cached. */
function resetEntitlementResolver() {
  instance = null;
}

module.exports = { getEntitlementResolver, resetEntitlementResolver };
