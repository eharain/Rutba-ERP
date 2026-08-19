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
 *   node scripts/smoke-identity.js
 */

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const connPath = require.resolve(path.join(ROOT, 'services/core/src/db/connection.js'));

// ── stub the database: one user holds three roles ────────────────────────
const USER_ROLES = { 1: ['hr_admin', 'accounts_viewer_admin', 'ap_staff'] };

function fakeDb(table) {
  const q = {
    _user: null,
    join() { return q; },
    where(col, val) { if (String(col).endsWith('user_id')) q._user = val; return q; },
    select() {
      const keys = USER_ROLES[q._user] || [];
      return Promise.resolve(keys.map((key) => ({ key })));
    },
  };
  if (table !== 'up_users_app_roles_lnk as l') return { ...q, select: () => Promise.resolve([]) };
  return q;
}

const stub = new Module(connPath);
stub.filename = connPath;
stub.loaded = true;
stub.exports = { getDb: () => fakeDb, withTransaction: async (cb) => cb(fakeDb), closeDb: async () => {} };
require.cache[connPath] = stub;

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

  console.log(fail.length ? `FAIL ${fail.length}/${count}:\n  - ` + fail.join('\n  - ') : `PASS all ${count} identity assertions`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('THREW:', e.stack); process.exit(1); });
