#!/usr/bin/env node
'use strict';

/**
 * Contract test for gateway assertion verification (portal task E3).
 *
 * Every rule in src/platform/assertion.js is checked against the SHARED
 * fixtures in `@rutba/contracts` — the same signed bytes the gateway, the
 * Relay and every other Rutba service test against. That package says it
 * plainly: *do not invent your own fakes*. A locally-minted "expired token"
 * proves this repo agrees with itself and nothing else, and the first place
 * anyone would find out is the gateway.
 *
 * The fixtures are read from disk rather than imported — scripts/lib/contracts.js
 * has the why, and the walk that finds them from a worktree as well as from the
 * main checkout.
 *
 *   node scripts/smoke-assertion.js
 *   RUTBA_CONTRACTS_DIR=/path/to/contracts node scripts/smoke-assertion.js
 *
 * Absent contracts are a loud skip, not a silent pass: this runs on machines
 * that have the platform repo checked out beside this one, and says so when
 * they do not.
 */

const path = require('path');
const Module = require('module');
const { REPO_ROOT: ROOT, openContracts } = require('./lib/contracts');

const contracts = openContracts();
const manifest = contracts.manifest;
const commonSchema = contracts.schema('common.schema.json');
const fixture = contracts.fixture;

// ── stubs, so the seam can be exercised without a database ─────────────────
const connPath = require.resolve(path.join(ROOT, 'services/core/src/db/connection.js'));
const connStub = new Module(connPath);
connStub.filename = connPath;
connStub.loaded = true;
connStub.exports = {
  getDb: () => () => { throw new Error('a portal identity must not query for local roles'); },
  withTransaction: async (cb) => cb(null),
  closeDb: async () => {},
};
require.cache[connPath] = connStub;

const healthPath = require.resolve(path.join(ROOT, 'services/core/src/platform/health.js'));
let ORG = null;
const healthStub = new Module(healthPath);
healthStub.filename = healthPath;
healthStub.loaded = true;
healthStub.exports = { instance: () => ({ orgId: ORG }) };
require.cache[healthPath] = healthStub;

const assertion = require(path.join(ROOT, 'services/core/src/platform/assertion.js'));
const identity = require(path.join(ROOT, 'services/core/src/platform/identity.js'));

const fail = [];
let count = 0;
const eq = (n, got, want) => {
  count += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail.push(`${n}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
};

const ctxWith = (state) => ({ state, get: (h) => (state.__headers || {})[h] || '' });

/** Run one fixture exactly as its own `verify` block says it must be run. */
async function runFixture(entry, extra = {}) {
  const fx = fixture(entry.path);
  const v = fx.verify || {};
  const jwks = assertion.createJwksLoader({ keys: fixture(v.keys) });
  try {
    const claims = await assertion.verifyAssertion(fx.jws, {
      jwks,
      issuer: v.issuer,
      audience: v.audience,
      maxLifetimeSeconds: v.max_lifetime_seconds,
      now: v.now,
      ...extra,
    });
    return { outcome: 'accept', claims };
  } catch (e) {
    if (e.name !== 'AssertionRejected') throw e;
    return { outcome: 'reject', reason: e.reason };
  }
}

(async () => {
  // ── the vocabulary is the platform's, not ours ──────────────────────────
  const enumReasons = commonSchema.$defs.verification_failure_reason.enum;
  const ours = Object.values(assertion.REASONS);
  eq('every reason we report is in the contract enum',
     ours.filter((r) => !enumReasons.includes(r)), []);
  eq('and we can report every reason the contract defines',
     enumReasons.filter((r) => !ours.includes(r)), []);
  eq('the header name is the frozen one', assertion.ASSERTION_HEADER, 'x-rutba-assertion');

  // ── every internal-assertion fixture, with the reason it names ──────────
  const entries = manifest.entries.filter((e) => e.kind === 'internal-assertion');
  eq('the contract still ships internal-assertion fixtures', entries.length > 0, true);

  for (const entry of entries) {
    const name = path.basename(entry.path, '.json');
    const got = await runFixture(entry);
    const want = entry.expect === 'accept'
      ? { outcome: 'accept' }
      : { outcome: 'reject', reason: entry.reason };
    eq(`fixture ${name}: ${entry.expect}${entry.reason ? ` (${entry.reason})` : ''}`,
       entry.expect === 'accept' ? { outcome: got.outcome } : { outcome: got.outcome, reason: got.reason },
       want);
  }

  // The lifetime cap is the contract's number, not one this repo picked.
  const valid = manifest.entries.find((e) => e.path === 'assertions/valid.json');
  eq('the 120s cap matches the fixture',
     assertion.MAX_LIFETIME_SECONDS, fixture(valid.path).verify.max_lifetime_seconds);

  // ── replay: the same assertion twice inside its own window ──────────────
  const replayCache = assertion.createReplayCache();
  const first = await runFixture(valid, { replayCache });
  const second = await runFixture(valid, { replayCache });
  eq('the first presentation is accepted', first.outcome, 'accept');
  eq('the same jti again is replayed',
     [second.outcome, second.reason], ['reject', 'replayed']);

  // ── the token does not get to choose its own algorithm ──────────────────
  const fx = fixture(valid.path);
  const [h, p, s] = fx.jws.split('.');
  const confused = [
    Buffer.from(JSON.stringify({ ...fx.header, alg: 'HS256' })).toString('base64url'), p, s,
  ].join('.');
  const jwks = assertion.createJwksLoader({ keys: fixture(fx.verify.keys) });
  const runRaw = async (token) => {
    try {
      await assertion.verifyAssertion(token, {
        jwks, issuer: fx.verify.issuer, audience: fx.verify.audience, now: fx.verify.now,
      });
      return 'accept';
    } catch (e) { return e.reason || e.name; }
  };
  eq('a header claiming HS256 against an RS256 key is refused',
     await runRaw(confused), 'signature_invalid');

  // A tampered payload fails on the signature, before any claim is believed.
  const tampered = [h, Buffer.from(JSON.stringify(
    { ...fx.payload, roles: ['hr:admin', 'finance:admin'] }
  )).toString('base64url'), s].join('.');
  eq('an edited payload fails on the signature', await runRaw(tampered), 'signature_invalid');
  eq('a token that is not a JWS at all is malformed', await runRaw('not-a-jws'), 'malformed_token');

  // ── the projection into this repo's identity ────────────────────────────
  const claims = (await runFixture(valid)).claims;
  const projected = assertion.claimsToPortalIdentity(claims);
  eq('projection carries the subject, org and filtered claims',
     [projected.sub, projected.org_id, projected.roles, projected.entitlements, projected.req_id],
     ['usr_8f3a2c', 'org_123', ['hr:admin', 'stock:viewer'],
      ['erp.stock', 'erp.sales', 'erp.hr'], 'req_01HQ8Z9XK4M2']);

  // …and through the seam, on an instance that serves exactly that org.
  ORG = 'org_123';
  const who = await identity.identityOf(ctxWith({ portalClaims: projected }));
  eq('the seam reports a portal identity',
     [who.source, who.sub, who.org_id], ['portal', 'usr_8f3a2c', 'org_123']);
  eq('roles arrive already in the portal dialect — nothing to translate',
     who.roles, ['hr:admin', 'stock:viewer']);
  eq('entitlements arrive too, unlike the local path', who.entitlements,
     ['erp.stock', 'erp.sales', 'erp.hr']);
  eq('a portal caller is a person, so policy applies to them',
     identity.isPerson(who), true);

  // The failure mode that matters: the right signature, the wrong instance.
  ORG = 'org_999';
  let refused = null;
  try { identity.subjectOf(ctxWith({ portalClaims: projected })); } catch (e) { refused = e.reason; }
  eq('an assertion for another org is refused with the contract\'s reason',
     refused, 'org_mismatch');

  // ── the door itself ─────────────────────────────────────────────────────
  // src/http/assertion.js is what turns a header into an identity, and its
  // three refusals are the reason it exists. Exercised with the real verifier
  // over the real fixture, so what is asserted here is the whole path a
  // gateway-fronted request takes.
  const { createAssertionMiddleware } = require(path.join(ROOT, 'services/core/src/http/assertion.js'));
  const httpCtx = (headers = {}) => ({
    state: {}, status: 200, body: undefined,
    get: (h) => headers[String(h).toLowerCase()] || '',
  });

  const verifier = (token) => assertion.verifyAssertion(token, {
    jwks: assertion.createJwksLoader({ keys: fixture(fx.verify.keys) }),
    issuer: fx.verify.issuer,
    audience: fx.verify.audience,
    now: fx.verify.now,
  });

  // No header at all: the local doors still get their turn.
  let reached = false;
  const passthrough = httpCtx();
  await createAssertionMiddleware({ verify: verifier })(passthrough, async () => { reached = true; });
  eq('a request with no assertion passes straight through',
     [reached, passthrough.state.portalClaims], [true, undefined]);

  // A valid one: claims on the context, and the request continues.
  reached = false;
  const accepted = httpCtx({ 'x-rutba-assertion': fx.jws });
  await createAssertionMiddleware({ verify: verifier })(accepted, async () => { reached = true; });
  eq('a verified assertion becomes portalClaims and continues',
     [reached, accepted.state.portalClaims && accepted.state.portalClaims.sub,
      accepted.state.portalClaims && accepted.state.portalClaims.org_id],
     [true, 'usr_8f3a2c', 'org_123']);

  // A rejected one stops here — it does not fall through to the local doors.
  // A request that presented an assertion is asking to be authenticated as one.
  reached = false;
  const rejected = httpCtx({ 'x-rutba-assertion': fixture('assertions/wrong-audience.json').jws });
  await createAssertionMiddleware({ verify: verifier })(rejected, async () => { reached = true; });
  eq('a rejected assertion is a 401 and goes no further',
     [reached, rejected.status, rejected.body.error.details.reason],
     [false, 401, 'audience_mismatch']);
  eq('and the caller is told the reason, not the detail',
     rejected.body.error.message, 'assertion rejected');

  // An assertion arriving where no portal is configured is loud, not ignored:
  // serving it as anonymous would answer a caller who believes they are
  // authenticated with this org's public data.
  reached = false;
  const unwired = httpCtx({ 'x-rutba-assertion': fx.jws });
  await createAssertionMiddleware()(unwired, async () => { reached = true; });
  eq('an assertion with the door unconfigured is a 501, not a shrug',
     [reached, unwired.status, unwired.body.error.name],
     [false, 501, 'PortalAuthNotWired']);

  console.log(fail.length
    ? `FAIL ${fail.length}/${count}:\n  - ` + fail.join('\n  - ')
    : `PASS all ${count} assertion-contract checks (fixtures: ${contracts.dir})`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('THREW:', e.stack); process.exit(1); });
