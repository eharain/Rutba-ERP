'use strict';

// Standalone unit tests for the marketplace engine's pure logic — no Strapi,
// no network, no framework. Run: `npm test` (from rutba-marketplace) or
// `node test/unit.js`. Covers the price math, the Daraz signing + transforms,
// the scheduler cron parser, the job runner, and the shared base helpers.

const assert = require('assert');
const crypto = require('crypto');

const base = require('../lib/providers/base');
const providers = require('../lib/providers');
const daraz = require('../lib/providers/daraz');
const engine = require('../lib/engine');
const { intervalFromCron } = require('../lib/scheduler');
const { createJobRunner } = require('../lib/jobs');

const T = daraz.__test;

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${name} :: ${e && e.message}`);
  }
}

(async () => {
  console.log('— base helpers —');
  await test('hmacSha256 returns 64-char hex', () => {
    assert.strictEqual(base.hmacSha256('k', 'msg', 'hex').length, 64);
  });
  await test('tokenExpired: past=true, future=false, none=false', () => {
    assert.strictEqual(base.tokenExpired({ token_expires_at: new Date(Date.now() - 1000).toISOString() }), true);
    assert.strictEqual(base.tokenExpired({ token_expires_at: new Date(Date.now() + 3600000).toISOString() }), false);
    assert.strictEqual(base.tokenExpired({}), false);
  });
  await test('extra reads extra_config with fallback', () => {
    assert.strictEqual(base.extra({ extra_config: { a: 1 } }, 'a'), 1);
    assert.strictEqual(base.extra({}, 'a', 'def'), 'def');
  });
  await test('extractError pulls Lazada/Daraz message', () => {
    assert.strictEqual(base.extractError({ code: 'X', message: 'boom' }), 'boom');
  });

  console.log('— provider registry —');
  await test('getAdapter/hasAdapter', () => {
    assert.strictEqual(providers.hasAdapter('daraz'), true);
    assert.strictEqual(providers.hasAdapter('nope'), false);
    assert.strictEqual(providers.getAdapter('daraz').key, 'daraz');
    assert.throws(() => providers.getAdapter('nope'));
  });

  console.log('— daraz: signing —');
  await test('sign: sorted apiPath+k+v, sha256 hex-upper, excludes sign', () => {
    const apiPath = '/orders/get';
    const params = { app_key: 'k', timestamp: '100', sign_method: 'sha256', sign: 'IGNORED' };
    const concat = `${apiPath}app_keyksign_methodsha256timestamp100`;
    const expected = crypto.createHmac('sha256', 'secret').update(concat, 'utf8').digest('hex').toUpperCase();
    assert.strictEqual(T.sign(apiPath, params, 'secret'), expected);
    // order-independent
    assert.strictEqual(
      T.sign(apiPath, { timestamp: '100', sign_method: 'sha256', app_key: 'k' }, 'secret'),
      expected,
    );
  });

  console.log('— daraz: transforms —');
  await test('xmlEscape escapes & < > " \'', () => {
    assert.strictEqual(T.xmlEscape(`a&b<c>"d'`), 'a&amp;b&lt;c&gt;&quot;d&apos;');
  });
  await test('buildPriceQuantityXml: Price/SalePrice/Quantity + escaping + omit non-positive', () => {
    const xml = T.buildPriceQuantityXml([
      { sku: 'A&B', quantity: 5, price: 110, salePrice: 99 },
      { sku: 'C', quantity: 0 },          // no price/salePrice
      { sku: 'Z', quantity: 3, price: 0 }, // price 0 → omitted
    ]);
    assert.ok(xml.includes('<SellerSku>A&amp;B</SellerSku>'));
    assert.ok(xml.includes('<Quantity>5</Quantity>'));
    assert.ok(xml.includes('<Price>110.00</Price>'));
    assert.ok(xml.includes('<SalePrice>99.00</SalePrice>'));
    assert.ok(xml.includes('<Sku><SellerSku>C</SellerSku><Quantity>0</Quantity></Sku>'));
    assert.ok(!/<Sku><SellerSku>Z<\/SellerSku><Quantity>3<\/Quantity><Price>/.test(xml));
    assert.ok(xml.startsWith('<Request><Product><Skus>'));
  });
  await test('normalizeOrder: ids, COD=not paid, shipping, totals', () => {
    const o = T.normalizeOrder({
      order_id: 123, order_number: 'X1', created_at: '2024-01-01T00:00:00+05:00',
      statuses: ['pending'], payment_method: 'Cash on Delivery', price: '500', shipping_fee: '50',
      customer_first_name: 'A', customer_last_name: 'B',
      address_shipping: { first_name: 'A', last_name: 'B', phone: '03', address1: 'St', city: 'KHI', country: 'PK' },
    });
    assert.strictEqual(o.externalOrderId, '123');
    assert.strictEqual(o.externalOrderNumber, 'X1');
    assert.strictEqual(o.status, 'pending');
    assert.strictEqual(o.paid, false);            // COD is collected later
    assert.strictEqual(o.shipping.line1, 'St');
    assert.strictEqual(o.shipping.name, 'A B');
    assert.strictEqual(o.totals.shippingFee, 50);
    assert.strictEqual(o.totals.total, 500);
  });
  await test('normalizeOrder: prepaid => paid true', () => {
    assert.strictEqual(T.normalizeOrder({ order_id: 1, payment_method: 'Credit Card' }).paid, true);
  });
  await test('normalizeItem: sku fallbacks, qty, unit/total, variant', () => {
    const it = T.normalizeItem({ shop_sku: 'SHOP', name: 'P', quantity: 2, paid_price: '100', variation: 'Red' });
    assert.strictEqual(it.sku, 'SHOP');
    assert.strictEqual(it.quantity, 2);
    assert.strictEqual(it.unitPrice, 100);
    assert.strictEqual(it.total, 200);
    assert.strictEqual(it.variant, 'Red');
  });
  await test('flattenCategoryTree: parent links + leaf', () => {
    const flat = T.flattenCategoryTree([{ category_id: 1, name: 'A', children: [{ category_id: 2, name: 'B', leaf: true }] }]);
    assert.strictEqual(flat.length, 2);
    assert.deepStrictEqual(flat[0], { external_id: '1', name: 'A', parent_id: null, leaf: false });
    assert.deepStrictEqual(flat[1], { external_id: '2', name: 'B', parent_id: '1', leaf: true });
  });

  console.log('— engine: price adjustment —');
  await test('applyAdjustment: pct + fixed, floor at 0, base 0', () => {
    assert.strictEqual(engine.applyAdjustment(100, { pct: 10, fixed: 50 }), 160);
    assert.strictEqual(engine.applyAdjustment(100, { pct: -5, fixed: 0 }), 95);
    assert.strictEqual(engine.applyAdjustment(200, { pct: 0, fixed: -250 }), 0); // floored
    assert.strictEqual(engine.applyAdjustment(0, { pct: 10, fixed: 5 }), 0);
    assert.strictEqual(engine.applyAdjustment(199.99, { pct: 12, fixed: 5 }), 228.99);
  });
  await test('effectiveAdjustment precedence + M3 layering (override keeps category fixed)', () => {
    const product = { categories: [{ documentId: 'cat1' }] };
    const account = { price_adjust_pct: 3 };
    const rules = [{ category: { documentId: 'cat1' }, adjust_pct: 8, adjust_fixed: 50, priority: 1 }];
    // category rule applies when no per-listing override
    assert.deepStrictEqual(engine.effectiveAdjustment(product, null, account, rules), { pct: 8, fixed: 50 });
    // per-listing % overrides the %, but the category's fixed surcharge is KEPT
    assert.deepStrictEqual(engine.effectiveAdjustment(product, { price_adjust_pct: 12 }, account, rules), { pct: 12, fixed: 50 });
    // no rule + no override => account default, fixed 0
    assert.deepStrictEqual(engine.effectiveAdjustment({ categories: [] }, null, account, []), { pct: 3, fixed: 0 });
    // highest-priority rule wins
    const rules2 = [
      { category: { documentId: 'cat1' }, adjust_pct: 1, priority: 1 },
      { category: { documentId: 'cat1' }, adjust_pct: 9, priority: 5 },
    ];
    assert.strictEqual(engine.effectiveAdjustment(product, null, account, rules2).pct, 9);
  });
  await test('end-to-end: category +8% +50 on a 100 product => 158', () => {
    const adj = engine.effectiveAdjustment(
      { categories: [{ documentId: 'c' }] }, null, { price_adjust_pct: 0 },
      [{ category: { documentId: 'c' }, adjust_pct: 8, adjust_fixed: 50, priority: 0 }],
    );
    assert.strictEqual(engine.applyAdjustment(100, adj), 158);
  });

  console.log('— scheduler / jobs —');
  await test('intervalFromCron parses */N min and 0 */N hr, else fallback', () => {
    assert.strictEqual(intervalFromCron('*/15 * * * *', 0), 15 * 60 * 1000);
    assert.strictEqual(intervalFromCron('0 */4 * * *', 0), 4 * 60 * 60 * 1000);
    assert.strictEqual(intervalFromCron('garbage', 999), 999);
  });
  await test('job runner: defineJob/run returns handler result; bad backend throws', async () => {
    const r = createJobRunner({ backend: 'inproc' });
    let ran = 0;
    r.defineJob('x', () => { ran += 1; return 42; });
    const v = await r.run('x');
    assert.strictEqual(v, 42);
    assert.strictEqual(ran, 1);
    await assert.rejects(() => r.run('missing'));
    assert.throws(() => createJobRunner({ backend: 'bullmq' }).scheduleRecurring('y', '*/5 * * * *', {}));
  });

  console.log('— rutba adapter: registry + capabilities —');
  const rutba = providers.getAdapter('rutba');
  await test('rutba registered, no-oauth, catalog+orders+inventory', () => {
    assert.strictEqual(providers.hasAdapter('rutba'), true);
    assert.strictEqual(rutba.key, 'rutba');
    assert.deepStrictEqual(rutba.capabilities, { oauth: false, orders: true, inventory: true, fulfillment: false, catalog: true });
    assert.strictEqual(typeof rutba.pushCatalog, 'function');
    assert.strictEqual(typeof rutba.fetchOrders, 'function');
  });

  console.log('— catalog transforms —');
  const CT = engine.__test;
  await test('mediaOut maps fields; null/urlless => null', () => {
    assert.strictEqual(CT.mediaOut(null), null);
    assert.strictEqual(CT.mediaOut({ name: 'x' }), null); // no url
    assert.deepStrictEqual(
      CT.mediaOut({ url: '/u.jpg', name: 'u', alternativeText: 'a', mime: 'image/jpeg', width: 10, height: 20, formats: { thumbnail: {} } }),
      { url: '/u.jpg', name: 'u', alternativeText: 'a', mime: 'image/jpeg', width: 10, height: 20, formats: { thumbnail: {} } },
    );
  });
  await test('taxonomyOut keeps name+slug pairs, drops empty', () => {
    assert.deepStrictEqual(
      CT.taxonomyOut([{ name: 'Shoes', slug: 'shoes' }, { documentId: 'x' }, { slug: 'bags' }]),
      [{ name: 'Shoes', slug: 'shoes' }, { name: null, slug: 'bags' }],
    );
  });
  await test('buildCatalogProduct: identity=origin docId, price adjusted, offer>0 only', () => {
    const p = { documentId: 'D1', sku: 'S1', barcode: 'B1', name: 'N', selling_price: 100, offer_price: 0, stock_quantity: 5, is_active: true };
    const out = CT.buildCatalogProduct(p, { pct: 10, fixed: 0 });
    assert.strictEqual(out.origin_document_id, 'D1');
    assert.strictEqual(out.selling_price, 110);
    assert.strictEqual(out.offer_price, null); // offer_price 0 => not applied
    assert.strictEqual(out.stock_quantity, 5);
  });

  console.log('— catalog payload assembly (variants) —');
  const acct = { price_adjust_pct: 0 };
  await test('parentDocIdOf: variant->parent, simple->self', () => {
    assert.strictEqual(CT.parentDocIdOf({ documentId: 'v1', is_variant: true, parent: { documentId: 'p1' } }), 'p1');
    assert.strictEqual(CT.parentDocIdOf({ documentId: 's1' }), 's1');
    // variant with missing parent falls back to its own id (won't be orphaned silently)
    assert.strictEqual(CT.parentDocIdOf({ documentId: 'v2', is_variant: true }), 'v2');
  });
  await test('groupVariantsByParent groups on parent.documentId', () => {
    const g = CT.groupVariantsByParent([
      { documentId: 'v1', parent: { documentId: 'p1' } },
      { documentId: 'v2', parent: { documentId: 'p1' } },
      { documentId: 'v3', parent: null },
    ]);
    assert.strictEqual(g.get('p1').length, 2);
    assert.strictEqual(g.has('v3'), false);
  });
  await test('assemble: variant nested, positive-or-parent price fallback', () => {
    const parents = [{ documentId: 'p1', sku: 'PSKU', name: 'Parent', selling_price: 200, offer_price: 150, is_active: true }];
    const variantsByParent = new Map([['p1', [
      { documentId: 'v1', sku: 'V1', selling_price: 250, is_active: true },   // own price
      { documentId: 'v2', sku: 'V2', selling_price: 0, is_active: true },     // falls back to parent 200
    ]]]);
    const { payload, metaByOrigin, skipped } = CT.assembleCatalogPayload({ parents, variantsByParent, listingByProduct: new Map(), account: acct, rules: [] });
    assert.strictEqual(skipped, 0);
    assert.strictEqual(payload.length, 1);
    assert.strictEqual(payload[0].variants.length, 2);
    assert.strictEqual(payload[0].variants[0].selling_price, 250);
    assert.strictEqual(payload[0].variants[1].selling_price, 200); // parent fallback
    assert.strictEqual(payload[0].variants[1].offer_price, 150);   // parent offer fallback
    assert.strictEqual(payload[0].variants[0].variants, undefined); // no nested variants field
    assert.strictEqual(metaByOrigin.get('p1').product.documentId, 'p1');
  });
  await test('assemble: skip inactive, no-sku, and is_variant-parent anomaly', () => {
    const parents = [
      { documentId: 'a', sku: 'A', is_active: false },                 // inactive
      { documentId: 'b', is_active: true },                            // no sku
      { documentId: 'c', sku: 'C', is_variant: true, parent: { documentId: 'x' } }, // anomaly
      { documentId: 'd', sku: 'D', selling_price: 10, is_active: true }, // ok
    ];
    const { payload, skipped } = CT.assembleCatalogPayload({ parents, variantsByParent: new Map(), listingByProduct: new Map(), account: acct, rules: [] });
    assert.strictEqual(skipped, 3);
    assert.strictEqual(payload.length, 1);
    assert.strictEqual(payload[0].sku, 'D');
  });
  await test('assemble: inactive variant is dropped from the nested set', () => {
    const parents = [{ documentId: 'p', sku: 'P', selling_price: 100, is_active: true }];
    const variantsByParent = new Map([['p', [
      { documentId: 'v1', sku: 'V1', selling_price: 100, is_active: true },
      { documentId: 'v2', sku: 'V2', selling_price: 100, is_active: false },
      { documentId: 'v3', selling_price: 100, is_active: true }, // no sku
    ]]]);
    const { payload } = CT.assembleCatalogPayload({ parents, variantsByParent, listingByProduct: new Map(), account: acct, rules: [] });
    assert.strictEqual(payload[0].variants.length, 1);
    assert.strictEqual(payload[0].variants[0].sku, 'V1');
  });

  console.log('— rutba adapter: transport (mocked fetch) —');
  const ACCOUNT = { documentId: 'ACC1', api_key: 'tok_123', extra_config: { base_url: 'https://api.online.test/api' } };
  function withMockFetch(handler, fn) {
    const orig = global.fetch;
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url, opts });
      const { status = 200, body } = handler({ url, opts }) || {};
      return { ok: status >= 200 && status < 300, status, statusText: 'x', text: async () => (body === undefined ? '' : JSON.stringify(body)) };
    };
    return Promise.resolve(fn(calls)).finally(() => { global.fetch = orig; });
  }
  await test('validateConnection GETs the integration ping with bearer token', async () => {
    await withMockFetch(() => ({ body: { data: { ok: true, ts: 'now' } } }), async (calls) => {
      const r = await rutba.validateConnection({ account: ACCOUNT });
      assert.strictEqual(r.ok, true);
      assert.ok(calls[0].url.endsWith('/products/integration/ping'));
      assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer tok_123');
    });
  });
  await test('pushCatalog POSTs origin_account_id+products, returns results', async () => {
    await withMockFetch(() => ({ body: { data: { results: [{ origin_document_id: 'D1', sku: 'S1', ok: true, external_id: 'X1', action: 'created' }] } } }), async (calls) => {
      const r = await rutba.pushCatalog({ account: ACCOUNT, products: [{ origin_document_id: 'D1', sku: 'S1' }] });
      assert.strictEqual(r.results[0].external_id, 'X1');
      assert.ok(calls[0].url.endsWith('/products/integration/ingest-catalog'));
      const sent = JSON.parse(calls[0].opts.body);
      assert.strictEqual(sent.origin_account_id, 'ACC1');
      assert.strictEqual(sent.products.length, 1);
    });
  });
  await test('pushCatalog empty products => no fetch, empty results', async () => {
    let called = 0;
    await withMockFetch(() => { called += 1; return { body: {} }; }, async () => {
      const r = await rutba.pushCatalog({ account: ACCOUNT, products: [] });
      assert.deepStrictEqual(r, { results: [] });
    });
    assert.strictEqual(called, 0);
  });
  await test('pushCatalog network error => per-row ok:false (no throw)', async () => {
    const orig = global.fetch;
    global.fetch = async () => { throw new Error('ECONNREFUSED'); };
    try {
      const r = await rutba.pushCatalog({ account: ACCOUNT, products: [{ origin_document_id: 'D1', sku: 'S1' }] });
      assert.strictEqual(r.results[0].ok, false);
      assert.ok(/ECONNREFUSED/.test(r.results[0].error));
    } finally { global.fetch = orig; }
  });
  await test('pushInventory POSTs updates; fetchOrders GETs export with since', async () => {
    await withMockFetch(() => ({ body: { data: { results: [{ sku: 'S1', ok: true }] } } }), async (calls) => {
      const r = await rutba.pushInventory({ account: ACCOUNT, updates: [{ sku: 'S1', quantity: 3, price: 9 }] });
      assert.strictEqual(r.results[0].ok, true);
      assert.ok(calls[0].url.endsWith('/products/integration/update-inventory'));
    });
    await withMockFetch(() => ({ body: { data: { orders: [{ externalOrderId: 'O1', items: [] }] } } }), async (calls) => {
      const orders = await rutba.fetchOrders({ account: ACCOUNT, since: '2026-01-01T00:00:00.000Z', limit: 50 });
      assert.strictEqual(orders.length, 1);
      assert.strictEqual(orders[0].externalOrderId, 'O1');
      assert.ok(calls[0].url.includes('/sale-orders/integration/export'));
      assert.ok(calls[0].url.includes('since='));
    });
  });
  await test('rutba connection missing base_url/token throws ProviderError', async () => {
    await assert.rejects(() => rutba.validateConnection({ account: { documentId: 'A', api_key: 't' } }), /not configured/);
    await assert.rejects(() => rutba.validateConnection({ account: { documentId: 'A', extra_config: { base_url: 'https://x/api' } } }), /token is missing/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
