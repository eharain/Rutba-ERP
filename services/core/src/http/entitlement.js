'use strict';

/**
 * The entitlement gate, as Koa middleware (portal task E2).
 *
 * It answers exactly one question — *did this org license this module* — and
 * refuses to answer any other. That narrowness is the design:
 *
 *   no `X-Rutba-App` header   PASS. The caller is not claiming an app: an API
 *                             token integration, a webhook, a probe. Blocking
 *                             those would break every server-to-server path to
 *                             enforce a per-app licence they never claimed.
 *   unknown app               PASS, and say so in state. A bad header is a bad
 *                             header; api-pro already rejects the claim with a
 *                             403. Answering 402 here would tell an operator to
 *                             go buy something they already own.
 *   known + ungated           PASS.
 *   known + gated             decide() — 402 when the org may not have it.
 *
 * 402 is deliberate and is not a permission error. 403 says "get permission",
 * 402 says "the org has to buy or renew something", and a desk that cannot tell
 * those apart spends its day guessing which one a ticket is.
 *
 * The middleware is the SECOND gate, not the only one. Same rule the helpdesk
 * already follows: a cron, an event handler and an HTTP request all reach the
 * same domain code, and only one of them passes through here. Service-level
 * checks use `decide()` directly.
 */

const { decide } = require('../platform/entitlements');
const { requiredFor } = require('../platform/app-entitlements');
const { sendError } = require('./rest');

const HEADER = 'x-rutba-app';

/**
 * @param resolver  from createEntitlementResolver()
 * @param isBypassed path predicate shared with the auth middleware
 */
function createEntitlementMiddleware({ resolver, isBypassed = () => false } = {}) {
  return async function entitlementGate(ctx, next) {
    if (isBypassed(ctx.path)) return next();

    const announced = ctx.get(HEADER);
    if (!announced) return next();

    const { known, required, app } = requiredFor(announced);
    if (!known) {
      // Recorded so a 403 from api-pro further down can be explained without
      // guessing which of the two rejected it.
      ctx.state.entitlement = { checked: false, reason: 'unknown-app', announced };
      return next();
    }
    if (!required || required.length === 0) {
      ctx.state.entitlement = { checked: false, reason: 'ungated', app };
      return next();
    }

    let entitlement;
    try {
      entitlement = await resolver.resolve(ctx.state.orgId || null);
    } catch (error) {
      // The licence source is unreachable AND the cache is past its stale
      // window. Failing open here would make "unreachable" the cheapest way to
      // run unlicensed; failing closed is the whole point of a stale window
      // that already gave it 24 hours of grace.
      ctx.state.entitlement = { checked: true, reason: 'unresolved', app, error: error.message };
      return sendError(ctx, 402, 'PaymentRequiredError',
        'Entitlements could not be verified for this instance', { app, keys: required });
    }

    const verdict = decide({ required, entitlement, method: ctx.method });
    ctx.state.entitlement = {
      checked: true,
      app,
      keys: required,
      status: entitlement.status,
      stale: Boolean(entitlement.stale),
      source: entitlement.source,
      ...verdict,
    };

    if (verdict.allow) return next();

    const message = verdict.reason === 'grace-read-only'
      ? 'This instance is in licence grace: reads are allowed, changes are not'
      : (verdict.reason === 'revoked'
        ? 'This instance\'s licence has been revoked'
        : `This organisation is not licensed for ${required.join(' or ')}`);

    return sendError(ctx, 402, 'PaymentRequiredError', message, {
      app,
      keys: required,
      status: entitlement.status,
      reason: verdict.reason,
    });
  };
}

module.exports = { createEntitlementMiddleware, HEADER };
