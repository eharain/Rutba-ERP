'use strict';

/**
 * Portal identity — the one shape every consumer codes against (portal task E3).
 *
 * `apps/admin/auth` stops being an identity provider: login moves to
 * auth.rutba.io, API routes accept internal assertions from the gateway, and
 * roles arrive as token claims rather than from a local table. That service is
 * being built in parallel (D:\Rutba\Auth) and does not exist yet.
 *
 * So this file is the seam, not the switch. It defines the identity every
 * caller reads — `{sub, org_id, roles, entitlements, req_id}` — and projects
 * today's local authentication into it. Code written against identityOf() keeps
 * working when the portal door opens; nothing has to be rewritten to find out
 * who the caller is, because nothing will have been reading ctx.state.user
 * directly.
 *
 * ── The verifier, and why it exists now ───────────────────────────────────
 *
 * This file first shipped without one. Writing a verifier against an issuer
 * that does not exist means inventing its key rotation, its clock skew
 * tolerance and its claim names, and every one of those guesses would have been
 * a security bug wearing a passing test.
 *
 * None of it is invented any more. `@rutba/contracts` froze the shape — header
 * name, the gateway's issuer, the 120-second lifetime cap, the audience rule
 * and a closed enum of failure reasons — and ships signed fixtures to test
 * against. src/platform/assertion.js implements exactly that, and
 * scripts/smoke-assertion.js checks it against the same bytes every other Rutba
 * service checks against. The auth service itself is still an empty scaffold:
 * it has to exist for the door to be switched ON, not for the lock to be right.
 *
 * The door being closed is still checked rather than assumed:
 * isPortalAuthEnabled() is false whenever any of the three env vars is unset,
 * which mirrors how the Social Relay gates its own third auth door
 * (Rutba-Portal plan/11, R2). An unconfigured portal is a disabled door, never
 * an open one — and verifyPortalAssertion() refuses rather than falling back to
 * checking a gateway token against the local secret.
 *
 * Env (unset means the door does not exist):
 *   RUTBA_GATEWAY_ISSUER     expected `iss` — the GATEWAY's internal issuer,
 *                            not auth's; they are deliberately different
 *   RUTBA_GATEWAY_JWKS_URL   the INTERNAL JWKS. Point this at auth's keys and
 *                            an edge token starts verifying as an assertion,
 *                            which is the whole boundary gone
 *   RUTBA_SERVICE_IDENTITY   this instance's `aud` from the gateway's routing
 *                            table. Required, not optional: unset would mean
 *                            accepting an assertion minted for another service
 */

const { get } = require('../config/env');
const { getDb } = require('../db/connection');
const { instance } = require('./health');
const { createJwksLoader, verifyAssertion } = require('./assertion');

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
 * An assertion that names a different org than the one this instance serves.
 *
 * Its own error because the answer is neither "unauthenticated" nor "not
 * allowed": the credential is fine, it simply arrived at the wrong instance.
 * Saying exactly that is what makes a misrouted gateway debuggable, instead of
 * it reading as a permissions bug in whichever module the request landed on.
 */
class PortalOrgMismatch extends Error {
  constructor(claimed, served) {
    super(`portal assertion is for org ${claimed}, but this instance serves ${served}`);
    this.name = 'PortalOrgMismatch';
    // The platform-wide vocabulary for this failure — contracts/schemas/
    // common.schema.json pins the enum, so the reason this instance logs is the
    // one the gateway and every other service log for the same event.
    this.reason = 'org_mismatch';
    this.status = 403;
  }
}

/**
 * True only when this instance has been told where the portal is. Unset env
 * means the door does not exist — never that it is open.
 */
function isPortalAuthEnabled() {
  return Boolean(
    get('RUTBA_GATEWAY_ISSUER', '')
    && get('RUTBA_GATEWAY_JWKS_URL', '')
    && get('RUTBA_SERVICE_IDENTITY', '')
  );
}

/**
 * The internal JWKS, fetched once and refreshed on rotation. Built lazily so an
 * instance with the door shut never reaches for a URL it does not have.
 */
let jwksLoader = null;
function internalJwks() {
  if (!jwksLoader) {
    jwksLoader = createJwksLoader({ url: get('RUTBA_GATEWAY_JWKS_URL', '') });
  }
  return jwksLoader;
}

/**
 * Verify one gateway assertion, or refuse.
 *
 * This is the seam `@rutba/portal-auth` will slot into when it publishes: same
 * signature, same refusals, and the checks it performs are the contract's, so
 * the swap is a deletion rather than a behaviour change.
 *
 * Refusing is still what an unconfigured instance does. A token that claims to
 * come from the gateway and is checked against the local secret is not
 * authenticated, it is guessed — and guessing is the one outcome that would
 * turn this seam into a bypass.
 *
 * @param {string} token the compact JWS from X-Rutba-Assertion
 * @param {{verify?: Function, jwks?: object, replayCache?: object, now?: any}} [deps]
 * @returns {Promise<object>} the verified assertion claims
 */
async function verifyPortalAssertion(token, deps = {}) {
  if (typeof deps.verify === 'function') return deps.verify(token);
  if (!isPortalAuthEnabled()) {
    throw new PortalAuthNotWired(
      'portal auth is not configured on this instance '
      + '(RUTBA_GATEWAY_ISSUER / RUTBA_GATEWAY_JWKS_URL / RUTBA_SERVICE_IDENTITY unset)'
    );
  }
  return verifyAssertion(token, {
    jwks: deps.jwks || internalJwks(),
    issuer: get('RUTBA_GATEWAY_ISSUER', ''),
    audience: get('RUTBA_SERVICE_IDENTITY', ''),
    replayCache: deps.replayCache || null,
    now: deps.now,
  });
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
  const keys = await appRoleKeys(userId);
  return keys.filter(Boolean).map(toRoleClaim).sort();
}

/**
 * The raw api-pro role keys a local user holds.
 *
 * Read through api-pro's own loader rather than through a second query of the
 * same two tables. That loader is memoised in strapi.apiPro.cache and cleared
 * when a grant changes, so resolving an identity adds no round-trip to a
 * request whose claim the interceptor is resolving anyway — and, the half that
 * matters more, the roles in a caller's claims cannot disagree with the roles
 * their request was policed against. Two private queries would drift apart the
 * first time one cache was invalidated and the other was not.
 *
 * The direct query stays for contexts with no plugin loaded — scripts, the
 * smoke test — and reads the same two tables.
 */
async function appRoleKeys(userId) {
  const strapi = global.strapi;
  if (strapi && strapi.apiPro) {
    try {
      // Required lazily: the compat layer builds the very `strapi` global this
      // reads, so importing it at module load would close a cycle.
      // eslint-disable-next-line global-require
      const { loadApiProServices } = require('../compat/strapi');
      const roles = await loadApiProServices().context.loadUserAppRoles(strapi, userId);
      if (Array.isArray(roles)) return roles.map((r) => r && r.key);
    } catch {
      // A plugin that cannot answer is not a reason to answer wrongly — fall
      // through to the query it would have made.
    }
  }
  const rows = await getDb()('up_users_app_roles_lnk as l')
    .join('api_pro_app_roles as r', 'r.id', 'l.app_role_id')
    .where('l.user_id', userId)
    .select('r.key');
  return rows.map((r) => r.key);
}

/**
 * Who is calling, without asking the database.
 *
 * Every field of an identity except `roles` is already on the context: the
 * subject, the org this instance serves, the gateway's correlation id and which
 * door the caller came through are all free to read. Only role claims cost a
 * query — and most readers never look at them. A request log line, an "is
 * anyone authenticated" gate and an audit correlation id each want the subject
 * and nothing else.
 *
 * So the seam answers at two depths rather than making every reader pay for the
 * deeper one. `subjectOf` is synchronous and safe to call anywhere, including
 * inside a logger's finally block; `identityOf` is the same answer plus roles
 * and entitlements. The two cannot disagree, because the second is built from
 * the first.
 *
 * @param {object} ctx Koa context
 * @returns {{sub: string|null, org_id: string|null, req_id: string|null, source: string}}
 */
function subjectOf(ctx) {
  const org_id = instance().orgId;
  const state = (ctx && ctx.state) || {};
  const req_id = requestId(ctx);

  // A verified portal assertion wins outright when one exists. Nothing sets
  // this yet; the door that will is verifyPortalAssertion() above.
  if (state.portalClaims) {
    const claims = state.portalClaims;
    return {
      sub: claims.sub || null,
      org_id: orgOfAssertion(claims.org_id, org_id),
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
      req_id,
      source: IDENTITY_SOURCES.LOCAL,
    };
  }

  if (state.apiToken) {
    return {
      sub: `token:${state.apiToken.id}`,
      org_id,
      req_id,
      source: IDENTITY_SOURCES.SERVICE,
    };
  }

  return { sub: null, org_id, req_id, source: IDENTITY_SOURCES.ANONYMOUS };
}

/**
 * The org an assertion is allowed to act on.
 *
 * An instance serves exactly one org (Tenant-Catalog model, portal task E4), so
 * an assertion naming a different one is not a caller to be served — it is a
 * token that reached the wrong instance. It is refused rather than trusted, and
 * refused rather than quietly downgraded to anonymous: a downgrade would answer
 * it with this org's public reads, which is the leak the check exists to stop.
 *
 * When this instance does not know its own org — a developer box with no
 * Tenant-Catalog references — there is nothing to check against, so the claim
 * is taken as given. The check is only ever as strong as the instance's own
 * identity, and failing every request on such a box would not make it stronger.
 */
function orgOfAssertion(claimed, served) {
  if (!claimed) return served;
  if (!served) return claimed;
  if (String(claimed) !== String(served)) throw new PortalOrgMismatch(claimed, served);
  return served;
}

/**
 * Is this caller a person?
 *
 * The question every gate on the request path is actually asking. api-pro
 * enforces per-action policy against app roles, and only a person holds those:
 * a service token's authority is the token itself (parity with Strapi, where an
 * API-token request skips the interceptor entirely), and an anonymous caller
 * only ever reaches a bypassed path.
 *
 * Asked of the source rather than of ctx.state.user, it keeps answering
 * correctly when the portal door opens. A gate written as `if (ctx.state.user)`
 * would skip every policy check for a portal-authenticated caller, because a
 * verified assertion sets claims and never a local user row — a fail-open that
 * would arrive with the switch rather than with the change that caused it.
 */
function isPerson(identity) {
  return Boolean(identity) && (
    identity.source === IDENTITY_SOURCES.LOCAL
    || identity.source === IDENTITY_SOURCES.PORTAL
  );
}

function requestId(ctx) {
  if (!ctx) return null;
  // The gateway stamps a request id so one user action can be followed across
  // portal, gateway and instance logs. Honour whichever header it uses rather
  // than minting a competing id that correlates with nothing. One precedence,
  // decided once here, so readers that used to pick their own order agree.
  return ctx.get('x-request-id') || ctx.get('x-correlation-id') || null;
}

/**
 * The identity of whoever made this request, role claims included.
 *
 * Resolved once per request and cached on ctx.state: several modules ask, and
 * the local path costs a query. Readers that only need to know *who* is calling
 * should use subjectOf() instead and pay nothing for roles they never read.
 *
 * `org_id` comes from the instance rather than the caller, and that is correct
 * for as long as an instance serves exactly one org (Tenant-Catalog model,
 * portal task E4). A portal assertion carries its own org claim, and it is
 * CHECKED against this one rather than trusted — see orgOfAssertion().
 *
 * `entitlements` is empty today because nothing issues them yet. Readers should
 * treat empty as "unknown", not as "nothing licensed" — the same fail-open rule
 * the client-side gate uses (packages/shared/lib/entitlements.js).
 *
 * @param {object} ctx Koa context
 * @returns {Promise<{sub: string|null, org_id: string|null, req_id: string|null,
 *   source: string, roles: string[], entitlements: string[]}>}
 */
async function identityOf(ctx) {
  if (ctx && ctx.state && ctx.state[CACHE_KEY]) return ctx.state[CACHE_KEY];

  const identity = await resolveIdentity(ctx);
  if (ctx && ctx.state) ctx.state[CACHE_KEY] = identity;
  return identity;
}

async function resolveIdentity(ctx) {
  const subject = subjectOf(ctx);

  if (subject.source === IDENTITY_SOURCES.PORTAL) {
    const claims = ((ctx && ctx.state) || {}).portalClaims || {};
    return {
      ...subject,
      roles: Array.isArray(claims.roles) ? claims.roles : [],
      entitlements: Array.isArray(claims.entitlements) ? claims.entitlements : [],
    };
  }

  if (subject.source === IDENTITY_SOURCES.LOCAL) {
    return { ...subject, roles: await localRoleClaims(ctx.state.user.id), entitlements: [] };
  }

  // A service token is not a person and holds no app roles; an anonymous caller
  // holds none either. Callers that need to know it is machine traffic read
  // `source`, which is why neither is given a synthetic role that would collide
  // with a real one.
  return { ...subject, roles: [], entitlements: [] };
}

module.exports = {
  IDENTITY_SOURCES,
  ROLE_LEVELS,
  toRoleClaim,
  PortalAuthNotWired,
  PortalOrgMismatch,
  isPortalAuthEnabled,
  verifyPortalAssertion,
  subjectOf,
  isPerson,
  identityOf,
  localRoleClaims,
};
