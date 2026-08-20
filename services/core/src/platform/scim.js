'use strict';

/**
 * SCIM sync-up — this org's memberships, pushed to central auth (portal task E3).
 *
 * The division is the whole point (GLOBAL-AUTH.md §5): **central owns the
 * identity, this org owns the membership.** A person's email, name, password and
 * MFA belong to auth.rutba.io and change through its own verified flows. What
 * belongs to the org — that this identity is a member of it, which apps and
 * roles they hold here, their employee id and department — is written from here.
 *
 * So this file builds membership writes and refuses to build anything else. A
 * patch touching userName, name, emails or credentials is rejected locally
 * rather than sent: central answers those with `scimType: "mutability"`, and a
 * local email edit that silently no-ops upstream is worse than one that fails
 * loudly here, where the person who made it is still looking.
 *
 * ── Shapes are the contract's, not this repo's ────────────────────────────
 *
 * Every payload below matches a fixture in @rutba/contracts
 * (schemas/scim/, fixtures/scim/), asserted byte-for-byte in
 * scripts/smoke-scim.js. Two details that prose gets wrong and the schema does
 * not: `employeeId` and `department` live inside `apps.<app>`, beside the roles
 * they describe, and the SCIM User is `additionalProperties: false` — a stray
 * key is a rejected request, not an ignored one.
 *
 * `active` here means MEMBERSHIP in the calling org. It is not global identity
 * status, and deactivating here must never read as suspending the person
 * everywhere they work.
 *
 * ── The door ──────────────────────────────────────────────────────────────
 *
 * Closed until RUTBA_SCIM_URL and RUTBA_SCIM_TOKEN are set. The credentials are
 * per-org, per-instance and scoped to membership writes (GLOBAL-AUTH.md §6), so
 * an instance that has not been handed them has nothing to push with — and
 * pushing to a service that does not exist yet would be a silent queue of
 * failures rather than a sync.
 */

const { get } = require('../config/env');
const { toRoleClaim } = require('./identity');

const SCHEMA_USER = 'urn:ietf:params:scim:schemas:core:2.0:User';
const SCHEMA_MEMBERSHIP = 'urn:rutba:params:scim:schemas:extension:2.0:Membership';
const SCHEMA_PATCH_OP = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
const SCHEMA_ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error';

/** This ERP's app key inside the Membership extension. */
const APP = 'erp';

/**
 * Paths an organization may not write, whatever the local UI let someone type.
 *
 * Matched on the leading attribute so `name.givenName` and `emails[0].value`
 * are caught with their parents. `active` is deliberately absent: it is the
 * membership flag, which is exactly what this org does own.
 */
const CENTRAL_OWNED = Object.freeze([
  'username', 'password', 'credentials', 'emails', 'name', 'phonenumbers',
  'mfa', 'id', 'externalid',
]);

class ScimMutabilityError extends Error {
  constructor(path) {
    super(`${path} is owned by central authentication and cannot be written by an organization`);
    this.name = 'ScimMutabilityError';
    this.scimType = 'mutability';
    this.path = path;
    this.status = 400;
  }
}

class ScimNotWired extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScimNotWired';
    this.status = 501;
  }
}

/** `<extension urn>:apps.<app>.<attr>` — the path form PatchOp uses. */
const membershipPath = (attr, app = APP) => `${SCHEMA_MEMBERSHIP}:apps.${app}.${attr}`;

/** True when this instance has been handed org-scoped SCIM credentials. */
function isScimEnabled() {
  return Boolean(get('RUTBA_SCIM_URL', '') && get('RUTBA_SCIM_TOKEN', ''));
}

/**
 * The role shape the wire accepts — common.schema.json#/$defs/role, copied here
 * because a request carrying a role central cannot parse fails as a whole, and
 * failing the whole sync over one odd grant is not a trade worth making.
 */
const ROLE_PATTERN = /^[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)?$/;

/**
 * Local api-pro role keys → the portal's claim dialect.
 *
 * The same translation the identity seam does, and deliberately the same
 * function: roles that reached central through a second implementation would
 * drift from the roles a request is policed against here, and the drift would
 * only ever surface as a permissions bug in a different product.
 *
 * Only claims the contract can carry are returned. toRoleClaim() passes a key
 * with an unrecognised level through untouched — `hr_wizard` stays
 * `hr_wizard` — which is right locally (a claim matching nothing is safe) and
 * wrong on the wire, where the underscore fails the role pattern and takes the
 * whole membership write with it. What was dropped is available separately
 * rather than swallowed: a grant that cannot be synced is something an operator
 * needs told, not something to discover from a drift report.
 */
function rolesFromAppRoleKeys(keys) {
  return [...new Set((keys || []).filter(Boolean).map(toRoleClaim))]
    .filter((claim) => ROLE_PATTERN.test(claim))
    .sort();
}

/** The keys rolesFromAppRoleKeys() had to leave behind, for the caller to log. */
function nonPortableRoleKeys(keys) {
  return (keys || [])
    .filter(Boolean)
    .filter((key) => !ROLE_PATTERN.test(toRoleClaim(key)))
    .sort();
}

/**
 * A SCIM User create request: "this person is a member of this org, with these
 * roles here".
 *
 * Central decides what that means — a brand-new identity, or a membership added
 * to one that already exists under this email. Both are the same request from
 * here, which is why this builds a membership and never an account.
 *
 * @param {{orgId: string, userName: string, app?: string, externalId?: string,
 *          givenName?: string, familyName?: string, displayName?: string,
 *          email?: string, active?: boolean, roles?: string[],
 *          employeeId?: string, department?: string, syncedAt?: string}} input
 */
function userCreateRequest(input) {
  if (!input || !input.orgId) throw new Error('scim: orgId is required — a membership is always in an org');
  if (!input.userName) throw new Error('scim: userName is required');

  const app = input.app || APP;
  const email = input.email || input.userName;
  const formatted = input.displayName
    || [input.givenName, input.familyName].filter(Boolean).join(' ')
    || undefined;

  const membershipApp = { roles: input.roles || [] };
  if (input.employeeId) membershipApp.employeeId = input.employeeId;
  if (input.department) membershipApp.department = input.department;

  const user = {
    schemas: [SCHEMA_USER, SCHEMA_MEMBERSHIP],
  };
  if (input.externalId) user.externalId = input.externalId;
  user.userName = input.userName;
  if (input.givenName || input.familyName || formatted) {
    user.name = {};
    if (input.givenName) user.name.givenName = input.givenName;
    if (input.familyName) user.name.familyName = input.familyName;
    if (formatted) user.name.formatted = formatted;
  }
  if (formatted) user.displayName = formatted;
  if (email) user.emails = [{ value: email, type: 'work', primary: true }];
  user.active = input.active === undefined ? true : Boolean(input.active);
  user[SCHEMA_MEMBERSHIP] = {
    orgId: input.orgId,
    apps: { [app]: membershipApp },
    syncedFrom: APP,
    ...(input.syncedAt ? { syncedAt: input.syncedAt } : {}),
  };
  return user;
}

/**
 * A PatchOp, with the mutability rule applied here rather than discovered on
 * the wire.
 *
 * @param {Array<{op: string, path: string, value?: any}>} operations
 */
function patch(operations) {
  const ops = Array.isArray(operations) ? operations : [operations];
  for (const op of ops) {
    if (!op || !op.path) throw new Error('scim: every operation needs a path');
    // Extension paths carry the urn, which contains colons and dots of its own;
    // only a bare attribute can be a central-owned one.
    if (op.path.startsWith('urn:')) continue;
    const leading = String(op.path).split(/[.[]/)[0].toLowerCase();
    if (CENTRAL_OWNED.includes(leading)) throw new ScimMutabilityError(op.path);
  }
  return { schemas: [SCHEMA_PATCH_OP], Operations: ops };
}

/** Replace this org's roles for one app. Membership data — ours to write. */
function patchRoles(roles, { app = APP } = {}) {
  return patch([{ op: 'replace', path: membershipPath('roles', app), value: roles || [] }]);
}

/**
 * End this membership. The identity and every other org this person belongs to
 * are untouched — that is what `active` means in the calling org's request.
 */
function patchDeactivate() {
  return patch([{ op: 'replace', path: 'active', value: false }]);
}

/** Did central refuse this because we reached for something it owns? */
function isMutabilityRefusal(body) {
  return Boolean(body
    && Array.isArray(body.schemas)
    && body.schemas.includes(SCHEMA_ERROR)
    && body.scimType === 'mutability');
}

/**
 * The sync-up client. Transport is injectable so the payloads can be asserted
 * without a service to send them to — which is the only way to test this today,
 * auth.rutba.io being an empty scaffold.
 *
 * @param {{baseUrl?: string, token?: string, fetchImpl?: Function}} [options]
 */
function createScimClient(options = {}) {
  const baseUrl = options.baseUrl || get('RUTBA_SCIM_URL', '');
  const token = options.token || get('RUTBA_SCIM_TOKEN', '');
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  async function send(method, path_, body) {
    if (!baseUrl || !token) {
      throw new ScimNotWired(
        'SCIM sync is not configured on this instance (RUTBA_SCIM_URL / RUTBA_SCIM_TOKEN unset)'
      );
    }
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}${path_}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/scim+json',
        accept: 'application/scim+json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = res && typeof res.text === 'function' ? await res.text() : '';
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep the raw text */ }
    if (!res || !res.ok) {
      const err = new Error(
        isMutabilityRefusal(parsed)
          ? `SCIM refused a central-owned attribute: ${parsed.detail || 'mutability'}`
          : `SCIM ${method} ${path_} failed (${res ? res.status : 'no response'})`
      );
      err.name = 'ScimRequestFailed';
      err.status = res ? res.status : 502;
      err.body = parsed;
      err.mutability = isMutabilityRefusal(parsed);
      throw err;
    }
    return parsed;
  }

  return {
    enabled: () => Boolean(baseUrl && token),
    /** POST /scim/v2/Users — create the identity, or link a membership to it. */
    createUser: (user) => send('POST', '/scim/v2/Users', user),
    /** PATCH /scim/v2/Users/:id — membership changes only. */
    patchUser: (id, patchOp) => send('PATCH', `/scim/v2/Users/${encodeURIComponent(id)}`, patchOp),
    /** GET /scim/v2/Users?filter=… — the read half of nightly reconciliation. */
    listUsers: (filter) => send(
      'GET',
      `/scim/v2/Users${filter ? `?filter=${encodeURIComponent(filter)}` : ''}`
    ),
  };
}

module.exports = {
  SCHEMA_USER,
  SCHEMA_MEMBERSHIP,
  SCHEMA_PATCH_OP,
  SCHEMA_ERROR,
  APP,
  CENTRAL_OWNED,
  ScimMutabilityError,
  ScimNotWired,
  membershipPath,
  isScimEnabled,
  ROLE_PATTERN,
  rolesFromAppRoleKeys,
  nonPortableRoleKeys,
  userCreateRequest,
  patch,
  patchRoles,
  patchDeactivate,
  isMutabilityRefusal,
  createScimClient,
};
