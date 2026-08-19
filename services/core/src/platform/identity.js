'use strict';

/**
 * Portal identity — the one shape every consumer codes against (portal task E3).
 *
 * `apps/admin/auth` stops being an identity provider: login moves to
 * auth.rutba.io, API routes accept internal assertions from the gateway, and
 * roles arrive as token claims rather than from a local table. That service is
 * being built in parallel (D:\Rutba\Rutba-Auth) and does not exist yet.
 *
 * So this file is the seam, not the switch. It defines the identity every
 * caller reads — `{sub, org_id, roles, entitlements, req_id}` — and projects
 * today's local authentication into it. Code written against identityOf() keeps
 * working when the portal door opens; nothing has to be rewritten to find out
 * who the caller is, because nothing will have been reading ctx.state.user
 * directly.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────
 *
 * There is no JWKS verification. Writing one against an issuer that does not
 * exist means inventing its key rotation, its clock skew tolerance and its
 * claim names, and every one of those guesses would be a security bug wearing
 * a passing test. verifyPortalAssertion() therefore refuses loudly until
 * PORTAL_ISSUER and PORTAL_JWKS_URL are set AND the verifier is supplied.
 *
 * The door being closed is checked, not assumed: isPortalAuthEnabled() is false
 * whenever the env is unset, which mirrors how the Social Relay gates its own
 * third auth door (Rutba-Portal plan/11, R2). An unconfigured portal is a
 * disabled door, never an open one.
 *
 * Env (all optional until the auth service ships):
 *   PORTAL_ISSUER     expected `iss` on a portal assertion
 *   PORTAL_JWKS_URL   where its signing keys live
 *   PORTAL_AUDIENCE   expected `aud` for this instance
 */

const { get } = require('../config/env');
const { getDb } = require('../db/connection');
const { instance } = require('./health');

/** Where an identity came from. Consumers branch on this, not on ctx internals. */
const IDENTITY_SOURCES = Object.freeze({
  /** Verified assertion from the portal gateway. Not reachable yet. */
  PORTAL: 'portal',
  /** Local users-permissions JWT — what every request uses today. */
  LOCAL: 'local',
  /** Strapi API token: the marketplace worker, inter-instance sync. */
  SERVICE: 'service',
  /** No credentials. A real answer, not an error — public reads rely on it. */
  ANONYMOUS: 'anonymous',
});

const CACHE_KEY = 'rutbaIdentity';

class PortalAuthNotWired extends Error {
  constructor(message) {
    super(message);
    this.name = 'PortalAuthNotWired';
    this.status = 501;
  }
}

/**
 * True only when this instance has been told where the portal is. Unset env
 * means the door does not exist — never that it is open.
 */
function isPortalAuthEnabled() {
  return Boolean(get('PORTAL_ISSUER', '') && get('PORTAL_JWKS_URL', ''));
}

/**
 * The `@rutba/portal-auth` entry point, kept honest.
 *
 * When the package publishes, this becomes a call into it and everything below
 * stays as-is. Until then it refuses rather than falling back to local
 * verification: a token that claims to be from the portal and is checked
 * against a local secret is not authenticated, it is guessed.
 *
 * @param {string} _token gateway assertion
 * @param {{verify?: Function}} [deps] injection point for the real verifier
 * @returns {Promise<object>} portal claims
 */
async function verifyPortalAssertion(_token, deps = {}) {
  if (typeof deps.verify === 'function') return deps.verify(_token);
  if (!isPortalAuthEnabled()) {
    throw new PortalAuthNotWired(
      'portal auth is not configured on this instance (PORTAL_ISSUER / PORTAL_JWKS_URL unset)'
    );
  }
  throw new PortalAuthNotWired(
    'portal auth is configured but @rutba/portal-auth is not installed — '
    + 'no JWKS verifier is available, and local verification of a portal token would not authenticate it'
  );
}

/**
 * Every role level in the api-pro vocabulary. Closed set, verified against all
 * 76 keys in @rutba/api-provider config/domains.json — the split below relies
 * on a key ending in one of these, so a new level added there must be added
 * here too or its holders silently lose the role in their claims.
 */
const ROLE_LEVELS = Object.freeze(['admin', 'manager', 'staff', 'employee', 'user', 'public']);

/**
 * Translate one api-pro role key into the portal's claim dialect.
 *
 * The portal speaks `domain:level` (`hr:admin`, `stock:viewer`); this repo
 * stores `hr_admin`. The split is on the LAST underscore, not the first:
 * `accounts_viewer_admin` is the accounts-viewer domain at admin level, and
 * splitting on the first would produce `accounts:viewer_admin` — a role nobody
 * granted, against a domain that would then never match.
 *
 * The namespace is NOT always the domain, and that is real rather than a bug to
 * paper over: the accounts-ap and accounts-ar domains carry keys `ap_admin` and
 * `ar_admin`. The key is echoed as it is stored, so the mapping stays
 * reversible; reconciling the two vocabularies is the portal's call to make,
 * not something to guess at here.
 *
 * A key that ends in no known level is passed through untouched rather than
 * mangled — a claim that does not match anything is safe, a wrong one is not.
 */
function toRoleClaim(key) {
  const at = key.lastIndexOf('_');
  if (at <= 0) return key;
  const level = key.slice(at + 1);
  if (!ROLE_LEVELS.includes(level)) return key;
  return `${key.slice(0, at).replace(/_/g, '-')}:${level}`;
}

/**
 * Role keys held by a local user, as claim-shaped strings.
 *
 * Translating here rather than at every reader means that the day claims arrive
 * for real, readers already speak the claim dialect and only this function goes
 * away.
 */
async function localRoleClaims(userId) {
  if (!userId) return [];
  const rows = await getDb()('up_users_app_roles_lnk as l')
    .join('api_pro_app_roles as r', 'r.id', 'l.app_role_id')
    .where('l.user_id', userId)
    .select('r.key');
  return rows
    .map((r) => r.key)
    .filter(Boolean)
    .map(toRoleClaim)
    .sort();
}

/**
 * The identity of whoever made this request.
 *
 * Resolved once per request and cached on ctx.state: several modules ask, and
 * the local path costs a query.
 *
 * `org_id` comes from the instance rather than the caller, and that is correct
 * for as long as an instance serves exactly one org (Tenant-Catalog model,
 * portal task E4). When portal assertions arrive they carry their own org
 * claim, and it must be CHECKED against this one rather than trusted — a token
 * for another org reaching this instance is the failure mode that matters.
 *
 * `entitlements` is empty today because nothing issues them yet. Readers should
 * treat empty as "unknown", not as "nothing licensed" — the same fail-open rule
 * the client-side gate uses (packages/shared/lib/entitlements.js).
 *
 * @param {object} ctx Koa context
 * @returns {Promise<{sub: string|null, org_id: string|null, roles: string[],
 *   entitlements: string[], req_id: string|null, source: string}>}
 */
async function identityOf(ctx) {
  if (!ctx) return anonymousIdentity(null);
  if (ctx.state && ctx.state[CACHE_KEY]) return ctx.state[CACHE_KEY];

  const identity = await resolveIdentity(ctx);
  if (ctx.state) ctx.state[CACHE_KEY] = identity;
  return identity;
}

function requestId(ctx) {
  if (!ctx) return null;
  // The gateway stamps a request id so one user action can be followed across
  // portal, gateway and instance logs. Honour whichever header it uses rather
  // than minting a competing id that correlates with nothing.
  return ctx.get('x-request-id') || ctx.get('x-correlation-id') || null;
}

function anonymousIdentity(ctx) {
  return {
    sub: null,
    org_id: instance().orgId,
    roles: [],
    entitlements: [],
    req_id: requestId(ctx),
    source: IDENTITY_SOURCES.ANONYMOUS,
  };
}

async function resolveIdentity(ctx) {
  const org_id = instance().orgId;
  const req_id = requestId(ctx);
  const state = ctx.state || {};

  // A verified portal assertion wins outright when one exists. Nothing sets
  // this yet; the door that will is verifyPortalAssertion() above.
  if (state.portalClaims) {
    const claims = state.portalClaims;
    return {
      sub: claims.sub || null,
      org_id: claims.org_id || org_id,
      roles: Array.isArray(claims.roles) ? claims.roles : [],
      entitlements: Array.isArray(claims.entitlements) ? claims.entitlements : [],
      req_id: claims.req_id || req_id,
      source: IDENTITY_SOURCES.PORTAL,
    };
  }

  if (state.user) {
    return {
      // Namespaced so a local subject can never be mistaken for a portal one
      // once both exist in the same logs and audit rows.
      sub: `up:${state.user.id}`,
      org_id,
      roles: await localRoleClaims(state.user.id),
      entitlements: [],
      req_id,
      source: IDENTITY_SOURCES.LOCAL,
    };
  }

  if (state.apiToken) {
    return {
      sub: `token:${state.apiToken.id}`,
      org_id,
      // A service token is not a person and holds no app roles. Callers that
      // need to know it is machine traffic read `source`, which is why this is
      // not given a synthetic role that would collide with a real one.
      roles: [],
      entitlements: [],
      req_id,
      source: IDENTITY_SOURCES.SERVICE,
    };
  }

  return anonymousIdentity(ctx);
}

module.exports = {
  IDENTITY_SOURCES,
  ROLE_LEVELS,
  toRoleClaim,
  PortalAuthNotWired,
  isPortalAuthEnabled,
  verifyPortalAssertion,
  identityOf,
  localRoleClaims,
};
