'use strict';

/**
 * The portal door (portal task E3).
 *
 * Reads the gateway's `X-Rutba-Assertion` header, verifies it against the
 * internal JWKS, and puts the result on ctx.state.portalClaims — which is the
 * one thing platform/identity.js has always been waiting for. Everything
 * downstream already reads the seam, so nothing else changes: the gates, the
 * logger, the upload check and helpdesk's audit trail all start answering for
 * portal callers the moment this middleware sets that key.
 *
 * ── Three refusals, and why each is a refusal rather than a shrug ──────────
 *
 * 1. An assertion arriving at an instance with no portal configured is a 501,
 *    not an ignored header. Ignoring it would serve a gateway-fronted request
 *    as anonymous — the caller believes they are authenticated, the instance
 *    quietly disagrees, and what comes back is this org's public data.
 *
 * 2. A failed verification is a 401 carrying the contract's own reason word
 *    (`unknown_key`, `lifetime_exceeded`, …) so one vocabulary spans gateway
 *    and instance logs. It never falls through to the local doors: a request
 *    that presented an assertion is asking to be authenticated as one.
 *
 * 3. An assertion for a different org is refused by the seam itself, when the
 *    identity is read. That check lives there rather than here because it is
 *    about this instance's own identity, not about the token's validity.
 *
 * The door stays shut until RUTBA_GATEWAY_ISSUER, RUTBA_GATEWAY_JWKS_URL and
 * RUTBA_SERVICE_IDENTITY are all set. Unset env is a disabled door, never an
 * open one — and an unset audience in particular would mean accepting an
 * assertion minted for the billing service, which is why it is required rather
 * than optional.
 */

const {
  ASSERTION_HEADER,
  createReplayCache,
  claimsToPortalIdentity,
} = require('../platform/assertion');
const { isPortalAuthEnabled, verifyPortalAssertion, PortalAuthNotWired } = require('../platform/identity');
const { sendError } = require('./rest');

/**
 * @param {{verify?: Function, replayCache?: object, now?: number}} [deps]
 *   injection points for the contract test; production passes nothing.
 */
function createAssertionMiddleware(deps = {}) {
  // One cache per process. Assertions live at most 120 seconds, so this is
  // bounded by the request rate over that window rather than by a guess.
  const replayCache = deps.replayCache || createReplayCache();

  return async function assertionAuth(ctx, next) {
    const raw = ctx.get(ASSERTION_HEADER);
    if (!raw) return next();

    if (!isPortalAuthEnabled() && typeof deps.verify !== 'function') {
      return sendError(ctx, 501, 'PortalAuthNotWired',
        'this instance is not configured for portal assertions '
        + '(RUTBA_GATEWAY_ISSUER / RUTBA_GATEWAY_JWKS_URL / RUTBA_SERVICE_IDENTITY unset)');
    }

    try {
      const claims = await verifyPortalAssertion(raw, { ...deps, replayCache });
      ctx.state.portalClaims = claimsToPortalIdentity(claims);
    } catch (err) {
      if (err instanceof PortalAuthNotWired) {
        return sendError(ctx, 501, 'PortalAuthNotWired', err.message);
      }
      if (err && err.name === 'AssertionRejected') {
        // The reason is the platform's word for what happened; the detail stays
        // in this instance's log, because telling a caller which of twelve ways
        // their token failed is telling them how to fix a forgery.
        ctx.state.assertionFailure = err.reason;
        return sendError(ctx, 401, 'UnauthorizedError', 'assertion rejected', { reason: err.reason });
      }
      throw err;
    }

    return next();
  };
}

module.exports = { createAssertionMiddleware };
