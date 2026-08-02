'use strict';

// Standalone unit tests for the /me/stock-items-search query shaper — no Strapi
// runtime, no DB. Run: `node tests/stock-items-query.test.js`.
//
// The shaper is what lets the POS search box send `?view=search&q=rawat` instead
// of the ~700-character `filters[$or][0][name][$containsi]=…&populate[product]…`
// URL it used to build client-side. These tests pin the two things that would
// silently break callers: the legacy fall-through, and the exact filter shape.

const assert = require('assert');
const {
  shapeStockItemsQuery,
  stockItemSearchOr,
  STOCK_ITEM_VIEWS,
} = require('../src/extensions/users-permissions/controllers/stock-items-query');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok   ${name}`); }
  catch (e) { failed += 1; console.log(`  FAIL ${name} :: ${e && e.message}`); }
}

// ── legacy fall-through ──────────────────────────────────────────────────────
// Anything without a recognised `view` must return null so the controller keeps
// honouring the old filters[…]/populate[…] contract. Callers still on that form
// (StockItemsEndpoints.listByProduct with a populate/fields override) depend on
// this, and a regression here would silently ignore their filters.

test('returns null when no view is given', () => {
  assert.strictEqual(shapeStockItemsQuery({}), null);
  assert.strictEqual(shapeStockItemsQuery({ filters: { status: 'InStock' } }), null);
  assert.strictEqual(shapeStockItemsQuery(undefined), null);
  assert.strictEqual(shapeStockItemsQuery(null), null);
});

test('returns null for an unrecognised view', () => {
  assert.strictEqual(shapeStockItemsQuery({ view: 'bogus' }), null);
  assert.strictEqual(shapeStockItemsQuery({ view: '' }), null);
  // A non-string view must not be treated as a lookup key.
  assert.strictEqual(shapeStockItemsQuery({ view: ['search'] }), null);
  assert.strictEqual(shapeStockItemsQuery({ view: 1 }), null);
});

test('does not resolve inherited Object properties as views', () => {
  // `view=constructor` must not select a "view" off the prototype chain.
  assert.strictEqual(shapeStockItemsQuery({ view: 'constructor' }), null);
  assert.strictEqual(shapeStockItemsQuery({ view: 'toString' }), null);
});

// ── search view (POS dropdown) ───────────────────────────────────────────────

test('search view builds the six-field $or for a term', () => {
  const { filters } = shapeStockItemsQuery({ view: 'search', q: 'rawat' });
  assert.deepStrictEqual(filters.$or, [
    { name: { $containsi: 'rawat' } },
    { barcode: { $containsi: 'rawat' } },
    { sku: { $containsi: 'rawat' } },
    { product: { name: { $containsi: 'rawat' } } },
    { product: { sku: { $containsi: 'rawat' } } },
    { product: { barcode: { $containsi: 'rawat' } } },
  ]);
});

test('term is trimmed, and blank terms add no $or at all', () => {
  assert.deepStrictEqual(
    shapeStockItemsQuery({ view: 'search', q: '  rawat  ' }).filters.$or,
    stockItemSearchOr('rawat').$or
  );
  // A blank search must list everything, not match the empty string.
  assert.strictEqual('$or' in shapeStockItemsQuery({ view: 'search', q: '   ' }).filters, false);
  assert.strictEqual('$or' in shapeStockItemsQuery({ view: 'search' }).filters, false);
});

test('search view populates product imagery + brand and the purchase', () => {
  const { populate } = shapeStockItemsQuery({ view: 'search', q: 'x' });
  assert.deepStrictEqual(populate, {
    product: { populate: { logo: true, gallery: true, brands: true } },
    purchase_item: { populate: { purchase: true } },
  });
  // The shaper must hand back the shared constant, not a mutated copy.
  assert.deepStrictEqual(populate, STOCK_ITEM_VIEWS.search);
});

// ── scalar filters ───────────────────────────────────────────────────────────

test('status / branch / product map onto the right filter shapes', () => {
  const { filters } = shapeStockItemsQuery({
    view: 'search', status: 'InStock', branch: 'br-doc-1', product: 'pr-doc-1',
  });
  assert.strictEqual(filters.status, 'InStock');
  assert.deepStrictEqual(filters.branch, { documentId: 'br-doc-1' });
  assert.deepStrictEqual(filters.product, { documentId: 'pr-doc-1' });
});

test('absent and blank scalars are omitted rather than sent as empty matches', () => {
  const { filters } = shapeStockItemsQuery({ view: 'search', status: '', branch: '   ' });
  assert.strictEqual('status' in filters, false);
  assert.strictEqual('branch' in filters, false);
  assert.strictEqual('product' in filters, false);
});

// ── archived ─────────────────────────────────────────────────────────────────
// Presence of `archived` is what makes the controller skip its default
// "exclude archived" clause. A caller that builds params conditionally can leave
// `archived=0` behind, and treating that as opt-in would show archived stock in
// the POS search box — so only an affirmative value counts.

test('archived opts in only on an affirmative value', () => {
  assert.strictEqual(shapeStockItemsQuery({ view: 'search', archived: '1' }).filters.archived, true);
  assert.strictEqual(shapeStockItemsQuery({ view: 'search', archived: 'true' }).filters.archived, true);
  for (const falsy of [undefined, '0', 'false', '', 'no']) {
    const { filters } = shapeStockItemsQuery({ view: 'search', archived: falsy });
    assert.strictEqual('archived' in filters, false, `archived=${JSON.stringify(falsy)} should not opt in`);
  }
});

// ── product view (product stock-items table) ─────────────────────────────────

test('product view filters by product and uses the lighter populate', () => {
  const shaped = shapeStockItemsQuery({ view: 'product', product: 'pr-doc-1', status: 'InStock' });
  assert.deepStrictEqual(shaped.filters.product, { documentId: 'pr-doc-1' });
  assert.strictEqual(shaped.filters.status, 'InStock');
  assert.deepStrictEqual(shaped.populate, {
    product: true,
    purchase_item: { populate: { purchase: true } },
  });
});

// ── pagination + sort ────────────────────────────────────────────────────────

test('page/pageSize pass through untouched for the controller to parse', () => {
  const shaped = shapeStockItemsQuery({ view: 'search', page: '2', pageSize: '300' });
  assert.strictEqual(shaped.page, '2');
  assert.strictEqual(shaped.pageSize, '300');
});

test('sort defaults to newest-first and honours an explicit value', () => {
  assert.strictEqual(shapeStockItemsQuery({ view: 'search' }).sort, 'createdAt:desc');
  assert.strictEqual(shapeStockItemsQuery({ view: 'search', sort: '' }).sort, 'createdAt:desc');
  assert.strictEqual(
    shapeStockItemsQuery({ view: 'search', sort: 'archived_at:desc' }).sort,
    'archived_at:desc'
  );
});

// ── full round trip ──────────────────────────────────────────────────────────

test('a full POS search request shapes to the pre-refactor filter set', () => {
  // What StockItemsEndpoints.list(0, 300, { statusFilter:'InStock', searchTerm:'rawat' })
  // now puts on the wire, and what the old client-built filters said.
  const shaped = shapeStockItemsQuery({
    view: 'search', q: 'rawat', status: 'InStock', page: '0', pageSize: '300',
    sort: 'createdAt:desc',
  });
  assert.deepStrictEqual(shaped.filters, {
    status: 'InStock',
    $or: stockItemSearchOr('rawat').$or,
  });
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}, 0);
