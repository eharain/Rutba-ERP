#!/usr/bin/env node
'use strict';

/**
 * Smoke for entitlement gating (portal task E2).
 *
 * Two halves. The pure half exercises `decide()` over the whole state space —
 * it is a small function whose every branch is a business rule, so it is worth
 * pinning exhaustively. The wired half runs a real Koa app with the middleware
 * mounted, because the interesting failures are about which requests the gate
 * lets THROUGH: a headerless API-token call, a probe, an unknown app.
 *
 *   node scripts/smoke-entitlements.js
 */

const http = require('http');
const Koa = require('koa');
const Router = require('@koa/router');

const {
  createEntitlementResolver, decide, stubSource, STATUSES,
} = require('../src/platform/entitlements');
const { requiredFor, allKeys, catalogue, assertComplete } = require('../src/platform/app-entitlements');
const { createEntitlementMiddleware } = require('../src/http/entitlement');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name} :: ${error.message}`);
    if (process.env.VERBOSE) console.log(error.stack);
  }
}
function assert(cond, message) { if (!cond) throw new Error(message); }

/** A resolver with a fixed answer, for the table-driven cases. */
function fixed(value) {
  return createEntitlementResolver({ source: async () => value });
}

function startApp(resolver) {
  const app = new Koa();
  const router = new Router();
  app.use(async (ctx, nextMw) => {
    // The real server installs these; the gate calls ctx.status/ctx.body only.
    await nextMw();
  });
  app.use(createEntitlementMiddleware({
    resolver,
    isBypassed: (p) => p === '/health' || p.startsWith('/_health'),
  }));
  router.get('/health', (ctx) => { ctx.body = { status: 'ok' }; });
  router.get('/api/anything', (ctx) => { ctx.body = { reached: true, state: ctx.state.entitlement || null }; });
  router.post('/api/anything', (ctx) => { ctx.body = { reached: true }; });
  app.use(router.routes()).use(router.allowedMethods());

  return new Promise((resolve) => {
    const server = http.createServer(app.callback());
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((r) => server.close(r)),
    }));
  });
}

(async () => {
  console.log('\nthe key registry');

  await test('every service in the manifest has an entitlement decision', () => {
    assertComplete();
  });

  await test('the 19 frozen keys match the portal table', () => {
    const expected = [
      'erp.ap-ar', 'erp.campaigns', 'erp.cms', 'erp.crm', 'erp.delivery', 'erp.ess',
      'erp.gl', 'erp.helpdesk', 'erp.hr', 'erp.leads', 'erp.mrp', 'erp.orders',
      'erp.payroll', 'erp.pos', 'erp.quotes', 'erp.social', 'erp.stock',
      'erp.storefront', 'erp.warehousing',
    ];
    assert(JSON.stringify(allKeys()) === JSON.stringify(expected),
      `keys drifted from the portal table:\n  got  ${allKeys().join(', ')}`);
  });

  await test('an app with several domains maps all of them to the same keys', () => {
    for (const d of ['accounts', 'accounts-ap', 'accounts-ar', 'accounts-viewer']) {
      const r = requiredFor(d);
      assert(r.known, `${d} unknown`);
      assert(JSON.stringify(r.required) === JSON.stringify(['erp.gl', 'erp.ap-ar']), `${d} -> ${r.required}`);
    }
  });

  await test('a deliberately ungated app is distinguishable from an unknown one', () => {
    const ungated = requiredFor('console');
    assert(ungated.known === true && ungated.required === null, 'console should be known-and-ungated');
    assert(typeof ungated.note === 'string' && ungated.note.length > 0, 'ungated apps must say why');

    const unknown = requiredFor('definitely-not-an-app');
    assert(unknown.known === false, 'an unknown app must not report as known');
  });

  await test('the catalogue marks which apps are gated', () => {
    const list = catalogue();
    const hr = list.find((a) => a.app === 'hr');
    const auth = list.find((a) => a.app === 'auth');
    assert(hr && hr.gated === true, 'hr should be gated');
    assert(auth && auth.gated === false, 'auth must never be gated — it is the way in');
  });

  console.log('\ndecide()');

  const ALL = { keys: null, status: 'active', source: 'stub' };
  const ONLY_HR = { keys: new Set(['erp.hr']), status: 'active', source: 'test' };

  await test('an ungated app always passes', () => {
    assert(decide({ required: null, entitlement: null }).allow === true, 'null required');
    assert(decide({ required: [], entitlement: null }).allow === true, 'empty required');
  });

  await test('a held key passes and a missing one does not', () => {
    assert(decide({ required: ['erp.hr'], entitlement: ONLY_HR }).allow === true, 'held key denied');
    const denied = decide({ required: ['erp.pos'], entitlement: ONLY_HR });
    assert(denied.allow === false && denied.reason === 'not-entitled', JSON.stringify(denied));
    assert(denied.status === 402, 'must be 402, not 403 — this is a licence, not a permission');
  });

  await test('any one key of a multi-key app grants it', () => {
    const glOnly = { keys: new Set(['erp.gl']), status: 'active' };
    assert(decide({ required: ['erp.gl', 'erp.ap-ar'], entitlement: glOnly }).allow === true, 'gl should grant accounts');
  });

  await test('keys:null means EVERY key, never none', () => {
    assert(decide({ required: ['erp.anything'], entitlement: ALL }).allow === true, 'null keys must grant');
    const none = { keys: new Set(), status: 'active' };
    assert(decide({ required: ['erp.hr'], entitlement: none }).allow === false, 'an empty set must grant nothing');
  });

  await test('grace allows reads and refuses writes', () => {
    const grace = { keys: new Set(['erp.hr']), status: 'grace' };
    for (const m of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      assert(decide({ required: ['erp.hr'], entitlement: grace, method: m }).allow === true, `${m} should read`);
    }
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const v = decide({ required: ['erp.hr'], entitlement: grace, method: m });
      assert(v.allow === false && v.reason === 'grace-read-only', `${m} should be refused: ${JSON.stringify(v)}`);
    }
  });

  await test('revoked refuses everything, reads included', () => {
    const revoked = { keys: new Set(['erp.hr']), status: 'revoked' };
    const v = decide({ required: ['erp.hr'], entitlement: revoked, method: 'GET' });
    assert(v.allow === false && v.reason === 'revoked', JSON.stringify(v));
  });

  await test('an unresolved entitlement denies rather than defaulting open', () => {
    const v = decide({ required: ['erp.hr'], entitlement: null });
    assert(v.allow === false && v.reason === 'unresolved', JSON.stringify(v));
  });

  console.log('\nthe resolver');

  await test('the stub grants everything and labels itself a stub', async () => {
    const r = await createEntitlementResolver({ source: stubSource() }).resolve();
    assert(r.keys === null, 'the stub should grant every key');
    assert(r.status === 'active', `status was ${r.status}`);
    assert(r.source === 'stub', 'the answer must say it came from a stub');
  });

  await test('the source is asked once, then cached', async () => {
    let calls = 0;
    const resolver = createEntitlementResolver({ source: async () => { calls++; return { keys: null, status: 'active' }; } });
    await Promise.all([resolver.resolve(), resolver.resolve(), resolver.resolve()]);
    await resolver.resolve();
    assert(calls === 1, `source called ${calls} times`);
  });

  await test('a stale-but-fresh-enough cache survives an unreachable source', async () => {
    let fail = false;
    let clock = 0;
    const resolver = createEntitlementResolver({
      source: async () => { if (fail) throw new Error('licence service down'); return { keys: new Set(['erp.hr']), status: 'active' }; },
      ttlMs: 1000,
      maxStaleMs: 10000,
      now: () => clock,
    });
    await resolver.resolve();
    fail = true;
    clock = 5000;                       // past the TTL, inside the stale window
    const r = await resolver.resolve();
    assert(r.stale === true, 'should be flagged stale');
    assert(r.keys.has('erp.hr'), 'should still serve the last known good answer');
  });

  await test('past the stale window it fails instead of granting forever', async () => {
    let fail = false;
    let clock = 0;
    const resolver = createEntitlementResolver({
      source: async () => { if (fail) throw new Error('licence service down'); return { keys: null, status: 'active' }; },
      ttlMs: 1000,
      maxStaleMs: 10000,
      now: () => clock,
    });
    await resolver.resolve();
    fail = true;
    clock = 20000;                      // beyond maxStale
    let threw = false;
    try { await resolver.resolve(); } catch { threw = true; }
    assert(threw, 'an indefinitely unreachable licence service must not keep granting');
  });

  console.log('\nthe gate, wired');

  await test('a request with no X-Rutba-App passes — token integrations must keep working', async () => {
    const app = await startApp(fixed({ keys: new Set([]), status: 'active' }));
    try {
      const r = await fetch(`${app.url}/api/anything`);
      assert(r.status === 200, `status ${r.status}`);
    } finally { await app.close(); }
  });

  await test('a bypassed path is never gated', async () => {
    const app = await startApp(fixed({ keys: new Set([]), status: 'revoked' }));
    try {
      const r = await fetch(`${app.url}/health`, { headers: { 'x-rutba-app': 'hr' } });
      assert(r.status === 200, `a revoked licence must not hide the health endpoint (got ${r.status})`);
    } finally { await app.close(); }
  });

  await test('an entitled app passes and records why', async () => {
    const app = await startApp(fixed({ keys: new Set(['erp.hr']), status: 'active' }));
    try {
      const r = await fetch(`${app.url}/api/anything`, { headers: { 'x-rutba-app': 'hr' } });
      const body = await r.json();
      assert(r.status === 200, `status ${r.status}`);
      assert(body.state && body.state.reason === 'entitled', JSON.stringify(body.state));
    } finally { await app.close(); }
  });

  await test('an unentitled app gets 402, naming the key it needs', async () => {
    const app = await startApp(fixed({ keys: new Set(['erp.hr']), status: 'active' }));
    try {
      const r = await fetch(`${app.url}/api/anything`, { headers: { 'x-rutba-app': 'pos' } });
      assert(r.status === 402, `status ${r.status} — a licence gap is 402, not 403`);
      const body = await r.json();
      const text = JSON.stringify(body);
      assert(text.includes('erp.pos'), `the response should name the key: ${text}`);
    } finally { await app.close(); }
  });

  await test('an unknown app is not a 402 — a bad header is not an unpaid bill', async () => {
    const app = await startApp(fixed({ keys: new Set([]), status: 'active' }));
    try {
      const r = await fetch(`${app.url}/api/anything`, { headers: { 'x-rutba-app': 'not-a-real-app' } });
      assert(r.status === 200, `status ${r.status}`);
      const body = await r.json();
      assert(body.state.reason === 'unknown-app', JSON.stringify(body.state));
    } finally { await app.close(); }
  });

  await test('grace: the same app can read and cannot write', async () => {
    const app = await startApp(fixed({ keys: new Set(['erp.hr']), status: 'grace' }));
    try {
      const read = await fetch(`${app.url}/api/anything`, { headers: { 'x-rutba-app': 'hr' } });
      assert(read.status === 200, `read got ${read.status}`);
      const write = await fetch(`${app.url}/api/anything`, { method: 'POST', headers: { 'x-rutba-app': 'hr' } });
      assert(write.status === 402, `write got ${write.status}`);
    } finally { await app.close(); }
  });

  await test('an ungated app is reachable even when the licence is revoked', async () => {
    // console/seed/auth are instance-internal or the way in; locking them would
    // leave nobody able to see WHY the instance is locked.
    const app = await startApp(fixed({ keys: new Set([]), status: 'revoked' }));
    try {
      const r = await fetch(`${app.url}/api/anything`, { headers: { 'x-rutba-app': 'console' } });
      assert(r.status === 200, `status ${r.status}`);
    } finally { await app.close(); }
  });

  await test('an unresolvable licence denies rather than opening the gate', async () => {
    const resolver = createEntitlementResolver({ source: async () => { throw new Error('down'); } });
    const app = await startApp(resolver);
    try {
      const r = await fetch(`${app.url}/api/anything`, { headers: { 'x-rutba-app': 'hr' } });
      assert(r.status === 402, `status ${r.status}`);
    } finally { await app.close(); }
  });

  await test('STATUSES is exactly the three the lifecycle defines', () => {
    assert(JSON.stringify([...STATUSES]) === JSON.stringify(['active', 'grace', 'revoked']),
      `statuses drifted: ${[...STATUSES].join(', ')}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error('ERR', error.stack || error.message);
  process.exit(1);
});
