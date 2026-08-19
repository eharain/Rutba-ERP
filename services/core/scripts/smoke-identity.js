#!/usr/bin/env node
'use strict';

/**
 * Smoke test for the portal identity seam (portal task E3) — no database
 * required; the connection module is stubbed.
 *
 * Two things are worth testing before the auth service exists:
 *
 *  1. **The role dialect.** Local role keys are translated into the portal's
 *     `domain:level` claims, and the translation is checked against every key
 *     in the real domains.json rather than a handful of examples. The case that
 *     motivates it — `accounts_viewer_admin`, which a naive first-underscore
 *     split turns into a role nobody granted — is asserted explicitly.
 *
 *  2. **The door stays shut.** An unconfigured portal must refuse, never fall
 *     back to verifying a portal token against a local secret. That is the
 *     assertion that stops this seam from quietly becoming an auth bypass.
 *
 *  3. **The gates read the seam, and reading it is free.** subjectOf() answers
 *     who is calling without touching the database — asserted by counting
 *     queries, because the request logger calls it on every single request and
 *     a hidden round-trip there would be found in production, not here. isPerson()
 *     is the question the policy gates ask; it must say yes to a portal caller,
 *     since a gate that tested for a local user row would skip every policy
 *     check the day that door opens.
 *
 *   node scripts/smoke-identity.js
 */

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const connPath = require.resolve(path.join(ROOT, 'services/core/src/db/connection.js'));

// ── stub the database: one user holds three roles ────────────────────────
const USER_ROLES = { 1: ['hr_admin', 'accounts_viewer_admin', 'ap_staff'] };

// Every query is counted: "subjectOf() costs nothing" is a claim about round
// trips, and the only honest way to assert it is to watch for them.
let queries = 0;

function fakeDb(table) {
  const q = {
    _user: null,
    join() { return q; },
    where(col, val) { if (String(col).endsWith('user_id')) q._user = val; return q; },
    select() {
      queries += 1;
      const keys = USER_ROLES[q._user] || [];
      return Promise.resolve(keys.map((key) => ({ key })));
    },
  };
  if (table !== 'up_users_app_roles_lnk as l') {
    return { ...q, select: () => { queries += 1; return Promise.resolve([]); } };
  }
  return q;
}

const stub = new Module(connPath);
stub.filename = connPath;
stub.loaded = true;
stub.exports = { getDb: () => fakeDb, withTransaction: async (cb) => cb(fakeDb), closeDb: async () => {} };
require.cache[connPath] = stub;

// ── stub the instance: which org this container serves is env-derived and
//    memoised, and the org check is only testable if it can be moved.
const healthPath = require.resolve(path.join(ROOT, 'services/core/src/platform/health.js'));
let ORG = null;
const healthStub = new Module(healthPath);
healthStub.filename = healthPath;
healthStub.loaded = true;
healthStub.exports = { instance: () => ({ orgId: ORG }) };
require.cache[healthPath] = healthStub;

// ── stub the compat layer: identity reaches through it for api-pro's cached
//    role loader, and both halves of that need proving — that it is used, and
//    that a plugin which cannot answer falls back rather than answering wrongly.
const compatPath = require.resolve(path.join(ROOT, 'services/core/src/compat/strapi.js'));
let apiProRoles = null;   // null → the loader throws
const compatStub = new Module(compatPath);
compatStub.filename = compatPath;
compatStub.loaded = true;
compatStub.exports = {
  loadApiProServices: () => ({
    context: {
      loadUserAppRoles: async () => {
        if (apiProRoles === null) throw new Error('plugin unavailable');
        return apiProRoles;
      },
    },
  }),
};
require.cache[compatPath] = compatStub;

const identity = require(path.join(ROOT, 'services/core/src/platform/identity.js'));
const domains = require(path.join(ROOT, 'packages/api-provider/config/domains.json'));

const fail = [];
let count = 0;
const eq = (n, got, want) => {
  count += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail.push(`${n}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
};

const ctxWith = (state) => ({ state, get: (h) => (state.__headers || {})[h] || '' });

(async () => {
  // ── role dialect ────────────────────────────────────────────────────────
  eq('simple key', identity.toRoleClaim('hr_admin'), 'hr:admin');
  // The whole reason the split is on the LAST underscore.
  eq('multi-word domain', identity.toRoleClaim('accounts_viewer_admin'), 'accounts-viewer:admin');
  eq('namespace that is not the domain', identity.toRoleClaim('ap_staff'), 'ap:staff');
  // An unrecognised level must pass through untouched: a claim matching nothing
  // is safe, a wrongly-split one is not.
  eq('unknown level passes through', identity.toRoleClaim('hr_wizard'), 'hr_wizard');
  eq('no underscore passes through', identity.toRoleClaim('root'), 'root');

  // Every real key maps, and every mapping is reversible.
  const keys = Object.values(domains).flatMap((d) => d.roles || []);
  const unmapped = keys.filter((k) => !identity.toRoleClaim(k).includes(':'));
  const irreversible = keys.filter(
    (k) => identity.toRoleClaim(k).replace(/-/g, '_').replace(':', '_') !== k
  );
  eq(`all ${keys.length} real role keys map`, unmapped, []);
  eq('every mapping is reversible', irreversible, []);

  // ── the portal door stays shut ──────────────────────────────────────────
  eq('portal auth disabled without env', identity.isPortalAuthEnabled(), false);
  let threw = null;
  try { await identity.verifyPortalAssertion('any.token.here'); } catch (e) { threw = e.name; }
  eq('unconfigured portal refuses rather than falling back', threw, 'PortalAuthNotWired');

  // ── identity projection ─────────────────────────────────────────────────
  const anon = await identity.identityOf(ctxWith({}));
  eq('anonymous is an answer, not an error',
     [anon.sub, anon.roles, anon.source], [null, [], 'anonymous']);

  const local = await identity.identityOf(ctxWith({ user: { id: 1 } }));
  eq('local subject is namespaced', local.sub, 'up:1');
  eq('local roles arrive as claims', local.roles,
     ['accounts-viewer:admin', 'ap:staff', 'hr:admin']);
  eq('local source', local.source, 'local');
  eq('entitlements empty until something issues them', local.entitlements, []);

  const svc = await identity.identityOf(ctxWith({ apiToken: { id: 9, name: 'worker' } }));
  eq('service token subject', svc.sub, 'token:9');
  eq('service token holds no app roles', [svc.roles, svc.source], [[], 'service']);

  const portal = await identity.identityOf(ctxWith({
    portalClaims: { sub: 'usr_1', org_id: 'org_9', roles: ['hr:admin'], entitlements: ['erp.hr'] },
  }));
  eq('portal claims win outright',
     [portal.sub, portal.org_id, portal.entitlements, portal.source],
     ['usr_1', 'org_9', ['erp.hr'], 'portal']);

  // Resolved once per request: the local path costs a query.
  const ctx = ctxWith({ user: { id: 1 } });
  const first = await identity.identityOf(ctx);
  const second = await identity.identityOf(ctx);
  eq('identity is cached on the context', first === second, true);

  // req_id is taken from the gateway rather than minted here.
  const traced = await identity.identityOf(ctxWith({ __headers: { 'x-request-id': 'req-abc' } }));
  eq('request id honoured from the gateway header', traced.req_id, 'req-abc');

  // One precedence, decided here, so an audit row and the log line that
  // produced it cannot name the same request differently.
  const both = identity.subjectOf(ctxWith({
    __headers: { 'x-request-id': 'req-abc', 'x-correlation-id': 'corr-xyz' },
  }));
  eq('x-request-id wins over x-correlation-id', both.req_id, 'req-abc');
  eq('x-correlation-id is the fallback',
     identity.subjectOf(ctxWith({ __headers: { 'x-correlation-id': 'corr-xyz' } })).req_id,
     'corr-xyz');

  // ── the subject is free ─────────────────────────────────────────────────
  // The request logger calls this on every request, in a finally block. A
  // round-trip hidden in here would be found in production, not in a test.
  const before = queries;
  const subject = identity.subjectOf(ctxWith({ user: { id: 1 } }));
  eq('subjectOf costs no query', queries - before, 0);
  eq('subjectOf still names the subject', [subject.sub, subject.source], ['up:1', 'local']);
  eq('subjectOf carries no roles field', subject.roles, undefined);

  // …and agrees with the full identity on every field they share.
  const full = await identity.identityOf(ctxWith({ user: { id: 1 } }));
  eq('the two depths agree',
     [subject.sub, subject.org_id, subject.req_id, subject.source],
     [full.sub, full.org_id, full.req_id, full.source]);

  // ── isPerson: the question every policy gate asks ───────────────────────
  eq('a local user is a person', identity.isPerson(subject), true);
  eq('a portal caller is a person too — the gate must not skip policy for one',
     identity.isPerson(identity.subjectOf(ctxWith({ portalClaims: { sub: 'usr_1' } }))), true);
  eq('a service token is not a person',
     identity.isPerson(identity.subjectOf(ctxWith({ apiToken: { id: 9 } }))), false);
  eq('an anonymous caller is not a person',
     identity.isPerson(identity.subjectOf(ctxWith({}))), false);
  eq('nothing is not a person', identity.isPerson(null), false);

  // ── an assertion for another org is refused, not served ─────────────────
  ORG = 'org_1';
  const foreign = ctxWith({ portalClaims: { sub: 'usr_1', org_id: 'org_9' } });
  let refused = null;
  try { identity.subjectOf(foreign); } catch (e) { refused = e.name; }
  eq('an assertion for another org is refused', refused, 'PortalOrgMismatch');
  eq('and refused with 403, not 401 — the credential is fine, the instance is wrong',
     (() => { try { identity.subjectOf(foreign); return null; } catch (e) { return e.status; } })(), 403);
  eq('the org it does name is accepted',
     identity.subjectOf(ctxWith({ portalClaims: { sub: 'usr_1', org_id: 'org_1' } })).org_id, 'org_1');
  // An instance that does not know its own org has nothing to check against.
  ORG = null;
  eq('an instance with no org of its own takes the claim as given',
     identity.subjectOf(ctxWith({ portalClaims: { sub: 'usr_1', org_id: 'org_9' } })).org_id, 'org_9');

  // ── role claims come from api-pro's cached loader ───────────────────────
  // Same fact, one source: claims that disagreed with the roles a request was
  // policed against would be worse than claims that cost a query.
  global.strapi = { apiPro: { cache: {} } };
  apiProRoles = [{ key: 'hr_admin' }, { key: 'ap_staff' }];
  const viaPlugin = await identity.localRoleClaims(1);
  eq('claims come from the plugin loader when one is available',
     viaPlugin, ['ap:staff', 'hr:admin']);

  // A plugin that cannot answer is not a reason to answer wrongly.
  apiProRoles = null;
  const q0 = queries;
  const viaFallback = await identity.localRoleClaims(1);
  eq('a plugin that throws falls back to the query it would have made',
     viaFallback, ['accounts-viewer:admin', 'ap:staff', 'hr:admin']);
  eq('and that fallback really did query', queries - q0, 1);
  delete global.strapi;

  console.log(fail.length ? `FAIL ${fail.length}/${count}:\n  - ` + fail.join('\n  - ') : `PASS all ${count} identity assertions`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('THREW:', e.stack); process.exit(1); });
