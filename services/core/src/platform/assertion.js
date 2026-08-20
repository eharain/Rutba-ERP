'use strict';

/**
 * Gateway assertion verification — Layer 2 of the token envelope (portal task E3).
 *
 * The client's edge token never reaches an instance. The API gateway verifies
 * it, strips the envelope, and forwards a NEW short-lived JWS of its own in the
 * `X-Rutba-Assertion` header, carrying only what this service needs: subject,
 * org, and the roles and entitlements already filtered to this app.
 *
 * ── Why this could be written when the seam refused to ────────────────────
 *
 * platform/identity.js deliberately shipped without a verifier, because writing
 * one against an issuer that does not exist means inventing its key rotation,
 * its skew tolerance and its claim names — and every one of those guesses is a
 * security bug wearing a passing test.
 *
 * None of it is guessed. `@rutba/contracts` froze the shape: header name,
 * issuer, the 120-second lifetime cap, the audience rule, and a closed enum of
 * failure reasons — with signed fixtures and the gateway's keys, so every rule
 * is verified against the same bytes every other Rutba service tests against.
 * scripts/smoke-assertion.js is that test. The auth service itself is still an
 * empty scaffold; it has to exist for the door to be switched on, not for the
 * lock to be correct.
 *
 * ── The boundary this file exists to hold ─────────────────────────────────
 *
 * Assertions are signed by the GATEWAY, with the gateway's own key, under the
 * gateway's own issuer. A service holds the internal JWKS and never auth's
 * public keys — which is what makes an edge token pushed straight at this
 * service fail as `unknown_key` rather than being accepted as an assertion.
 * Configure this with auth's JWKS URL and that boundary is gone, which is why
 * the env vars are named for the gateway and not for the portal.
 *
 * The verification itself lives in `@rutba/shared/core/auth` — the same code
 * the OIDC client uses on the edge token, because a security verifier kept in
 * two places is one that drifts, and the half that drifts is found as a
 * permissions bug in another product months later. What stays here is what is
 * specific to this layer: which claims are required, the typ, the cap, and the
 * projection into this repo's identity.
 */

const {
  REASONS,
  TokenRejected,
  createJwksLoader,
  createReplayCache,
  verifyJws,
} = require('@rutba/shared/core/auth');

/** GLOBAL-AUTH.md §3.1: an internal assertion may not live longer than this. */
const MAX_LIFETIME_SECONDS = 120;

/** The header the gateway carries it in. Frozen by the contract. */
const ASSERTION_HEADER = 'x-rutba-assertion';

/** The `typ` the gateway stamps, distinguishing an assertion from an edge token. */
const ASSERTION_TYP = 'rutba-assertion+jwt';

/** contracts/schemas/internal-assertion.schema.json `required`. */
const REQUIRED_CLAIMS = Object.freeze([
  'iss', 'sub', 'aud', 'org', 'roles', 'entitlements', 'req_id', 'iat', 'exp',
]);

/**
 * The refusal this layer throws. It is the shared class under a name the
 * request path recognises — `err.name` is what src/http/assertion.js branches
 * on, while `err.reason` stays the platform's own word for what happened.
 */
const AssertionRejected = TokenRejected;
const ERROR_NAME = 'AssertionRejected';

/**
 * Verify one internal assertion and return its claims.
 *
 * @param {string} jws compact JWS from the X-Rutba-Assertion header
 * @param {{jwks: {get: Function}, issuer: string, audience: string,
 *          maxLifetimeSeconds?: number, now?: any, clockToleranceSeconds?: number,
 *          replayCache?: object}} options
 * @returns {Promise<object>} the verified claims
 */
async function verifyAssertion(jws, options = {}) {
  const claims = await verifyJws(jws, {
    ...options,
    requiredClaims: REQUIRED_CLAIMS,
    typ: ASSERTION_TYP,
    maxLifetimeSeconds: options.maxLifetimeSeconds || MAX_LIFETIME_SECONDS,
    errorName: ERROR_NAME,
  });
  // The schema requires `org.id`, not merely an `org` object, and an assertion
  // without one cannot be scoped to anything.
  if (!claims.org || typeof claims.org !== 'object' || !claims.org.id) {
    throw new TokenRejected(REASONS.MISSING_CLAIM, 'org.id', ERROR_NAME);
  }
  return claims;
}

/**
 * Contract claims → the shape platform/identity.js already projects.
 *
 * The seam's identity predates this contract and does not change for it: `org`
 * is an object here and a single `org_id` there, because an instance serves one
 * org and the slug is a label, not an authorisation input.
 */
function claimsToPortalIdentity(claims) {
  return {
    sub: claims.sub,
    org_id: claims.org && claims.org.id,
    org_slug: (claims.org && claims.org.slug) || null,
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    entitlements: Array.isArray(claims.entitlements) ? claims.entitlements : [],
    req_id: claims.req_id || null,
    jti: claims.jti || null,
  };
}

module.exports = {
  REASONS,
  MAX_LIFETIME_SECONDS,
  ASSERTION_HEADER,
  ASSERTION_TYP,
  REQUIRED_CLAIMS,
  AssertionRejected,
  createJwksLoader,
  createReplayCache,
  verifyAssertion,
  claimsToPortalIdentity,
};
