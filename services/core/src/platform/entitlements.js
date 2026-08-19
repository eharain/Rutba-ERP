'use strict';

/**
 * Entitlements — is this org licensed for this module at all? (portal task E2)
 *
 * This is a THIRD authorization axis and it sits before the other two. Not to
 * be confused with either:
 *
 *   api-pro          who you are and which role you claimed  → 403
 *   helpdesk policy  what that role may do to this ticket    → 403
 *   entitlement      whether the org bought this module      → 402
 *
 * An admin of an org that never licensed `erp.hr` is still an admin; there is
 * simply no HR here to be an admin of. That is why the status code differs:
 * 403 tells a caller to get permission, 402 tells them the org has to buy or
 * renew something, and a support desk that cannot tell those apart spends its
 * day guessing. (`services/core/src/domain/helpdesk/policy/entitlement.js` is
 * the role-capability matrix despite its name; it predates this and is a
 * different thing.)
 *
 * **The resolver here is a STUB and says so on every answer.** The portal owns
 * licensing; the real implementation is `@rutba/license-client`, which is not
 * published yet. What is real is the *interface*, the decision logic and the
 * enforcement path — so the swap is one file, not a refactor. Until then the
 * stub grants everything, because an unlicensed-by-default gate in front of a
 * live estate is an outage, not a safety measure.
 *
 * E5's lifecycle is implemented here rather than deferred, because it changes
 * what the gate DOES and retrofitting it later means revisiting every call site:
 *
 *   active   entitled keys pass
 *   grace    entitled keys pass for READS; writes are refused. A licence that
 *            lapsed mid-month must not cost an org its data entry, but it must
 *            not quietly keep selling either.
 *   revoked  nothing passes. The instance is locked, not deleted.
 */

const { get } = require('../config/env');

const STATUSES = new Set(['active', 'grace', 'revoked']);
/** Methods that only read. Everything else is a write under `grace`. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** How long a cached answer stays usable when the source cannot be reached. */
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_STALE_MS = 24 * 60 * 60 * 1000;

class EntitlementError extends Error {
  constructor(message, { status = 402, key = null, reason = null } = {}) {
    super(message);
    this.name = 'PaymentRequiredError';
    this.status = status;
    this.key = key;
    this.reason = reason;
  }
}

/**
 * The stub source.
 *
 * Grants everything by default. Two env vars exist so the *gate* can be tested
 * and demonstrated before a licence service exists — without them there is no
 * way to see a 402 until the real client lands, and an enforcement path nobody
 * has watched refuse anything is an enforcement path nobody has tested.
 *
 *   RUTBA_ENTITLEMENTS         comma list; restricts to exactly these keys
 *   RUTBA_ENTITLEMENT_STATUS   active | grace | revoked
 */
function stubSource() {
  return async function resolveStub() {
    const raw = String(get('RUTBA_ENTITLEMENTS', '') || '').trim();
    const status = String(get('RUTBA_ENTITLEMENT_STATUS', 'active') || 'active').toLowerCase();
    if (!STATUSES.has(status)) {
      throw new Error(`RUTBA_ENTITLEMENT_STATUS must be one of ${[...STATUSES].join(', ')}, got '${status}'`);
    }
    return {
      // `null` means "every key", which is what an unconfigured stub grants.
      // An empty Set would mean "entitled to nothing" — the opposite — so the
      // two must never be conflated.
      keys: raw === '' ? null : new Set(raw.split(',').map((k) => k.trim()).filter(Boolean)),
      status,
      source: 'stub',
    };
  };
}

/**
 * Wrap a source with the last-known-good cache the real client also needs.
 *
 * A licence service that is briefly unreachable must not take the instance
 * down — but it must not grant forever either, or "unreachable" becomes the
 * cheapest way to run unlicensed. So: serve the cached answer past its TTL,
 * marked `stale`, up to `maxStaleMs`; beyond that, fail.
 */
function createEntitlementResolver({
  source = stubSource(),
  ttlMs = DEFAULT_TTL_MS,
  maxStaleMs = DEFAULT_MAX_STALE_MS,
  now = () => Date.now(),
} = {}) {
  let cached = null;      // { value, at }
  let inFlight = null;

  async function refresh(orgId) {
    // Collapse concurrent refreshes: a cold start behind a burst of requests
    // should ask the licence service once, not once per request.
    if (!inFlight) {
      inFlight = Promise.resolve(source(orgId))
        .then((value) => { cached = { value, at: now() }; return value; })
        .finally(() => { inFlight = null; });
    }
    return inFlight;
  }

  return {
    async resolve(orgId = null) {
      const age = cached ? now() - cached.at : Infinity;
      if (cached && age < ttlMs) return { ...cached.value, stale: false, ageMs: age };

      try {
        const value = await refresh(orgId);
        return { ...value, stale: false, ageMs: 0 };
      } catch (error) {
        if (cached && age < maxStaleMs) {
          // Degraded, not broken — and it says which.
          return { ...cached.value, stale: true, ageMs: age, error: error.message };
        }
        throw error;
      }
    },
    /** Testing and `/health` want to see the cache without touching it. */
    peek() { return cached ? { ...cached.value, ageMs: now() - cached.at } : null; },
    reset() { cached = null; inFlight = null; },
  };
}

/**
 * The decision, as a pure function so it can be tested exhaustively and reused
 * anywhere — a route, a service method, a cron, a nav builder.
 *
 * `required` is the app's key list. ANY of them grants the app (an app with two
 * keys, like accounts' `erp.gl` + `erp.ap-ar`, is reachable if the org bought
 * either — the finer split is per-feature, inside the app). `null`/empty means
 * the app is deliberately ungated and always passes.
 */
function decide({ required, entitlement, method = 'GET' }) {
  if (!required || required.length === 0) {
    return { allow: true, reason: 'ungated' };
  }
  if (!entitlement) {
    return { allow: false, reason: 'unresolved', status: 402 };
  }
  if (entitlement.status === 'revoked') {
    return { allow: false, reason: 'revoked', status: 402 };
  }

  // `keys: null` from the stub means "everything".
  const held = entitlement.keys;
  const has = held === null || required.some((k) => held.has(k));
  if (!has) {
    return { allow: false, reason: 'not-entitled', status: 402, key: required[0] };
  }

  if (entitlement.status === 'grace' && !READ_METHODS.has(String(method).toUpperCase())) {
    return { allow: false, reason: 'grace-read-only', status: 402, key: required[0] };
  }

  return { allow: true, reason: entitlement.status === 'grace' ? 'grace-read' : 'entitled' };
}

module.exports = {
  createEntitlementResolver,
  stubSource,
  decide,
  EntitlementError,
  STATUSES,
  READ_METHODS,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_STALE_MS,
};
