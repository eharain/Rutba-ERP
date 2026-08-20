'use strict';

/**
 * OIDC client — the half of portal task E3 that faces the browser.
 *
 * `apps/admin/auth` stops being an identity provider. Login moves to
 * auth.rutba.io: authorization code + PKCE, with `org_hint` taken from the
 * instance's own subdomain so a person landing on acme.rutba.io is offered
 * Acme rather than a tenant picker (GLOBAL-AUTH.md §4). No local passwords, no
 * local sessions beyond the OIDC session handling.
 *
 * This file is the client's mechanics, and lives in packages/shared rather than
 * in services/core because the app that needs it is a Next app and cannot
 * import from an out-of-workspace backend. It shares ./jws.js with the
 * instance's assertion verifier — one verifier, three token layers.
 *
 * ── What is here, and what each part rests on ─────────────────────────────
 *
 *   PKCE                RFC 7636. Asserted against the RFC's own published
 *                       test vector, so the challenge this sends is the one
 *                       every OIDC provider expects — not one that merely
 *                       round-trips against itself.
 *   authorization URL   RFC 6749 + OIDC Core, plus the Rutba-specific
 *                       `org_hint` from GLOBAL-AUTH.md §4.
 *   discovery           the standard /.well-known/openid-configuration.
 *   token request       the standard code-exchange body.
 *   access-token check  the claims are pinned by @rutba/contracts
 *                       (access-token-claims.schema.json) and verified against
 *                       its eleven signed fixtures.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────
 *
 * The Next routes: the redirect handler, the callback, the session cookie, the
 * logout. Those need a registered client and a running issuer to be worth
 * anything, and auth.rutba.io is still an empty scaffold. A login flow written
 * against an issuer nobody can exercise is the same trap this workstream has
 * refused twice already — it would pass its own tests and prove nothing.
 * Everything above is testable today, so it exists today.
 */

const crypto = require('crypto');
const { REASONS, TokenRejected, createJwksLoader, verifyJws } = require('./jws');

/** contracts/schemas/access-token-claims.schema.json `required`. */
const ACCESS_TOKEN_CLAIMS = Object.freeze([
  'iss', 'sub', 'aud', 'azp', 'org', 'roles', 'entitlements', 'sid', 'iat', 'exp',
]);

/** GLOBAL-AUTH.md: an edge token is an hour at most. */
const MAX_ACCESS_TOKEN_LIFETIME_SECONDS = 3600;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * A PKCE verifier/challenge pair (RFC 7636, S256).
 *
 * The verifier is 32 random bytes base64url-encoded — 43 characters, the
 * shortest length the RFC allows and the one every provider accepts.
 */
function createPkcePair() {
  const verifier = b64url(crypto.randomBytes(32));
  return { verifier, challenge: pkceChallenge(verifier), method: 'S256' };
}

/** The S256 transformation on its own, so the RFC's test vector can check it. */
function pkceChallenge(verifier) {
  return b64url(crypto.createHash('sha256').update(verifier, 'ascii').digest());
}

/** A random, opaque value for `state` or `nonce`. */
const randomToken = (bytes = 32) => b64url(crypto.randomBytes(bytes));

/**
 * Where to send the browser to log in.
 *
 * `org_hint` is the Rutba-specific parameter, and it is a HINT: it preselects
 * the org whose subdomain the person arrived on. It is not authorization —
 * which org a token is minted for is central's decision from the membership
 * registry, never a query parameter's.
 *
 * @param {{authorizationEndpoint: string, clientId: string, redirectUri: string,
 *          scope?: string, state: string, nonce?: string, codeChallenge: string,
 *          codeChallengeMethod?: string, orgHint?: string, prompt?: string,
 *          loginHint?: string}} input
 * @returns {string}
 */
function authorizationUrl(input) {
  const required = ['authorizationEndpoint', 'clientId', 'redirectUri', 'state', 'codeChallenge'];
  for (const key of required) {
    if (!input || !input[key]) throw new Error(`oidc: ${key} is required to build an authorization URL`);
  }
  const url = new URL(input.authorizationEndpoint);
  const params = url.searchParams;
  params.set('response_type', 'code');
  params.set('client_id', input.clientId);
  params.set('redirect_uri', input.redirectUri);
  params.set('scope', input.scope || 'openid profile email');
  params.set('state', input.state);
  if (input.nonce) params.set('nonce', input.nonce);
  params.set('code_challenge', input.codeChallenge);
  params.set('code_challenge_method', input.codeChallengeMethod || 'S256');
  if (input.orgHint) params.set('org_hint', input.orgHint);
  if (input.prompt) params.set('prompt', input.prompt);
  if (input.loginHint) params.set('login_hint', input.loginHint);
  return url.toString();
}

/**
 * The org hint carried by the instance's own hostname.
 *
 * `acme.rutba.io` → `acme`. A bare apex, an IP, or `localhost` yields null:
 * there is no org in those, and guessing one would preselect the wrong tenant
 * for whoever is testing.
 */
function orgHintFromHost(host) {
  if (!host) return null;
  const name = String(host).split(':')[0].toLowerCase();
  if (!name || /^[\d.]+$/.test(name)) return null;
  const labels = name.split('.');
  if (labels.length < 3) return null;
  const [first] = labels;
  if (!first || first === 'www' || first === 'auth' || first === 'api') return null;
  return first;
}

/** The form body for exchanging an authorization code, PKCE verifier included. */
function tokenRequestBody(input) {
  const required = ['code', 'redirectUri', 'clientId', 'codeVerifier'];
  for (const key of required) {
    if (!input || !input[key]) throw new Error(`oidc: ${key} is required to exchange a code`);
  }
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', input.code);
  body.set('redirect_uri', input.redirectUri);
  body.set('client_id', input.clientId);
  body.set('code_verifier', input.codeVerifier);
  // A confidential client also sends its secret; a public one relies on PKCE
  // alone, which is why the verifier above is not optional.
  if (input.clientSecret) body.set('client_secret', input.clientSecret);
  return body;
}

/**
 * Fetch and cache the issuer's discovery document.
 *
 * Endpoints are read rather than assumed: an issuer is entitled to move them,
 * and a client that hardcodes /authorize breaks silently when one does.
 */
function createDiscovery({ issuer, fetchImpl = globalThis.fetch, ttlMs = 60 * 60 * 1000, now = Date.now } = {}) {
  let doc = null;
  let fetchedAt = 0;
  let inflight = null;

  async function load() {
    if (!issuer) throw new Error('oidc: no issuer configured — the portal door is shut');
    if (doc && now() - fetchedAt < ttlMs) return doc;
    if (inflight) return inflight;
    inflight = (async () => {
      const url = `${String(issuer).replace(/\/+$/, '')}/.well-known/openid-configuration`;
      const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!res || !res.ok) {
        throw new Error(`oidc: discovery failed (${res ? res.status : 'no response'}) at ${url}`);
      }
      const next = await res.json();
      if (next.issuer !== issuer) {
        // The one discovery check that matters: a document claiming a different
        // issuer than the one asked for is either a misconfiguration or someone
        // else's issuer, and both are refusals.
        throw new Error(`oidc: discovery says issuer ${next.issuer}, expected ${issuer}`);
      }
      doc = next;
      fetchedAt = now();
      return doc;
    })().finally(() => { inflight = null; });
    return inflight;
  }

  return {
    load,
    cached: () => doc,
    jwks: (options = {}) => createJwksLoader({
      url: doc && doc.jwks_uri,
      fetchImpl,
      ...options,
    }),
  };
}

/**
 * Verify an edge access token issued by auth.rutba.io.
 *
 * Note which keys this takes: AUTH's, not the gateway's. This runs in the OIDC
 * client, which is the one place in the estate that legitimately holds them —
 * an instance behind the gateway holds only the internal JWKS, and that
 * asymmetry is what stops an edge token being replayed at a service.
 *
 * @param {string} jws
 * @param {{jwks: object, issuer: string, audience: string, orgSlug?: string,
 *          now?: any, maxLifetimeSeconds?: number, replayCache?: object}} options
 */
async function verifyAccessToken(jws, options = {}) {
  return verifyJws(jws, {
    ...options,
    requiredClaims: ACCESS_TOKEN_CLAIMS,
    // Omitting the option gets the hour cap; passing it explicitly — including
    // as undefined — opts out. Not a flourish: the contract ships a
    // deliberately long-lived token that must still verify, so "no cap" has to
    // be sayable, and `|| DEFAULT` cannot say it.
    maxLifetimeSeconds: 'maxLifetimeSeconds' in options
      ? options.maxLifetimeSeconds
      : MAX_ACCESS_TOKEN_LIFETIME_SECONDS,
    errorName: 'AccessTokenRejected',
  });
}

/** Access-token claims → the identity shape the rest of the estate reads. */
function claimsToIdentity(claims) {
  return {
    sub: claims.sub,
    org_id: claims.org && claims.org.id,
    org_slug: (claims.org && claims.org.slug) || null,
    plan: (claims.org && claims.org.plan) || null,
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    entitlements: Array.isArray(claims.entitlements) ? claims.entitlements : [],
    session_id: claims.sid || null,
    client_id: claims.azp || null,
  };
}

module.exports = {
  REASONS,
  TokenRejected,
  ACCESS_TOKEN_CLAIMS,
  MAX_ACCESS_TOKEN_LIFETIME_SECONDS,
  createPkcePair,
  pkceChallenge,
  randomToken,
  authorizationUrl,
  orgHintFromHost,
  tokenRequestBody,
  createDiscovery,
  verifyAccessToken,
  claimsToIdentity,
};
