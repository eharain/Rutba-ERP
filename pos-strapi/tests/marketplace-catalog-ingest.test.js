'use strict';

// Standalone unit tests for the Rutba↔Rutba catalog ingest util — no Strapi
// runtime, no DB. A tiny in-memory `strapi` mock stands in for db.query +
// documents(). Run: `node tests/marketplace-catalog-ingest.test.js`.

const assert = require('assert');
const { ingestCatalog, updateInventory, uniqueBarcode } = require('../src/utils/marketplace-catalog-ingest');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok   ${name}`); }
  catch (e) { failed += 1; console.log(`  FAIL ${name} :: ${e && e.message}`); }
}

// ── in-memory strapi mock ────────────────────────────────────────────────────
function makeStrapi() {
  const tables = {
    'api::product.product': [],
    'api::category.category': [],
    'api::brand.brand': [],
    'plugin::upload.file': [],
  };
  let seq = 1;
  const nextId = () => seq++;

  function matches(row, where) {
    for (const [k, v] of Object.entries(where || {})) {
      if (v && typeof v === 'object' && '$ne' in v) { if (row[k] === v.$ne) return false; continue; }
      if (row[k] !== v) return false;
    }
    return true;
  }

  const db = {
    query: (uid) => ({
      async findOne({ where }) { return tables[uid].find((r) => matches(r, where)) || null; },
    }),
  };

  const documents = (uid) => ({
    async create({ data }) {
      const row = { id: nextId(), documentId: `doc_${uid.split('.').pop()}_${nextId()}`, publishedAt: null, ...data };
      // slug uniqueness for uid fields (category/brand/product) — mimic Strapi
      if (data.slug && tables[uid].some((r) => r.slug === data.slug)) {
        const err = new Error('This attribute must be unique (slug)');
        throw err;
      }
      tables[uid].push(row);
      return row;
    },
    async update({ documentId, data }) {
      const row = tables[uid].find((r) => r.documentId === documentId);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    },
    async publish({ documentId }) {
      const row = tables[uid].find((r) => r.documentId === documentId);
      if (row) row.publishedAt = '2026-07-17T00:00:00.000Z';
      return row;
    },
  });

  return { db, documents, log: { warn() {} }, _tables: tables };
}

const P = (over = {}) => ({ origin_document_id: 'o1', sku: 'SKU1', barcode: 'BAR1', name: 'Widget', slug: 'widget', selling_price: 100, stock_quantity: 4, is_active: true, categories: [{ name: 'Tools', slug: 'tools' }], brands: [], media: {}, variants: [], ...over });

(async () => {
  console.log('— uniqueBarcode —');
  await test('no clash returns desired', async () => {
    const s = makeStrapi();
    assert.strictEqual(await uniqueBarcode(s, 'B1', null), 'B1');
  });
  await test('clash with a different product => index suffix', async () => {
    const s = makeStrapi();
    s._tables['api::product.product'].push({ id: 1, documentId: 'other', barcode: 'B1' });
    assert.strictEqual(await uniqueBarcode(s, 'B1', 'self'), 'B1-2');
  });
  await test('same documentId is not a clash (self excluded)', async () => {
    const s = makeStrapi();
    s._tables['api::product.product'].push({ id: 1, documentId: 'self', barcode: 'B1' });
    assert.strictEqual(await uniqueBarcode(s, 'B1', 'self'), 'B1');
  });
  await test('null barcode stays null', async () => {
    assert.strictEqual(await uniqueBarcode(makeStrapi(), null, null), null);
  });

  console.log('— ingestCatalog: create / update —');
  await test('creates a product, publishes it, stamps origin identity', async () => {
    const s = makeStrapi();
    const { results } = await ingestCatalog(s, { origin_account_id: 'ACC', products: [P()] });
    assert.strictEqual(results[0].ok, true);
    assert.strictEqual(results[0].action, 'created');
    const prod = s._tables['api::product.product'][0];
    assert.strictEqual(prod.sku, 'SKU1');
    assert.strictEqual(prod.external_ids.rutba_origin, 'o1');
    assert.strictEqual(prod.external_ids.rutba_origin_account, 'ACC');
    assert.ok(prod.publishedAt, 'published');
    // category was find-or-created + published
    assert.strictEqual(s._tables['api::category.category'].length, 1);
    assert.strictEqual(s._tables['api::category.category'][0].slug, 'tools');
  });
  await test('re-ingest same SKU updates in place (no duplicate)', async () => {
    const s = makeStrapi();
    await ingestCatalog(s, { origin_account_id: 'ACC', products: [P({ selling_price: 100 })] });
    const { results } = await ingestCatalog(s, { origin_account_id: 'ACC', products: [P({ selling_price: 175 })] });
    assert.strictEqual(results[0].action, 'updated');
    assert.strictEqual(s._tables['api::product.product'].length, 1);
    assert.strictEqual(s._tables['api::product.product'][0].selling_price, 175);
  });

  console.log('— ingestCatalog: barcode index-on-collision —');
  await test('different product, same incoming barcode => suffixed', async () => {
    const s = makeStrapi();
    await ingestCatalog(s, { origin_account_id: 'ACC', products: [P({ origin_document_id: 'o1', sku: 'SKU1', barcode: 'DUP' })] });
    await ingestCatalog(s, { origin_account_id: 'ACC', products: [P({ origin_document_id: 'o2', sku: 'SKU2', slug: 'widget2', barcode: 'DUP' })] });
    const rows = s._tables['api::product.product'];
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].barcode, 'DUP');
    assert.strictEqual(rows[1].barcode, 'DUP-2');
  });
  await test('same product re-ingest keeps its own barcode (not suffixed)', async () => {
    const s = makeStrapi();
    await ingestCatalog(s, { origin_account_id: 'ACC', products: [P({ barcode: 'KEEP' })] });
    await ingestCatalog(s, { origin_account_id: 'ACC', products: [P({ barcode: 'KEEP' })] });
    assert.strictEqual(s._tables['api::product.product'][0].barcode, 'KEEP');
  });

  console.log('— ingestCatalog: variants + media —');
  await test('variant upserted as own row, linked to parent, is_variant=true', async () => {
    const s = makeStrapi();
    const product = P({
      variants: [{ origin_document_id: 'ov1', sku: 'SKU1-V', barcode: 'BARV', name: 'Widget Red', selling_price: 120, media: {} }],
    });
    const { results } = await ingestCatalog(s, { origin_account_id: 'ACC', products: [product] });
    assert.strictEqual(results[0].variants.ok, 1);
    const rows = s._tables['api::product.product'];
    const parent = rows.find((r) => r.sku === 'SKU1');
    const variant = rows.find((r) => r.sku === 'SKU1-V');
    assert.ok(parent && variant);
    assert.strictEqual(variant.is_variant, true);
    assert.strictEqual(variant.parent, parent.documentId);
    assert.strictEqual(variant.external_ids.rutba_origin, 'ov1');
  });
  await test('media registered by reference (upload.file by url), idempotent', async () => {
    const s = makeStrapi();
    const media = { logo: { url: 'https://images.rutba.pk/a.jpg', name: 'a', mime: 'image/jpeg' }, gallery: [{ url: 'https://images.rutba.pk/b.jpg' }] };
    await ingestCatalog(s, { origin_account_id: 'ACC', products: [P({ media })] });
    // same URLs on a second product must not re-create the file rows
    await ingestCatalog(s, { origin_account_id: 'ACC', products: [P({ origin_document_id: 'o2', sku: 'SKU2', slug: 'w2', barcode: 'B2', media })] });
    const files = s._tables['plugin::upload.file'];
    assert.strictEqual(files.length, 2, 'two distinct URLs => two file rows, deduped across products');
    assert.ok(files.every((f) => /images\.rutba\.pk/.test(f.url)));
    const prod = s._tables['api::product.product'][0];
    assert.ok(prod.logo, 'logo linked');
    assert.strictEqual(prod.gallery.length, 1);
  });
  await test('slug collision on create falls back to name-autogen (no throw)', async () => {
    const s = makeStrapi();
    // occupy the slug first
    s._tables['api::product.product'].push({ id: 99, documentId: 'pre', slug: 'widget', sku: 'PRE' });
    const { results } = await ingestCatalog(s, { origin_account_id: 'ACC', products: [P()] });
    assert.strictEqual(results[0].ok, true);
    assert.strictEqual(results[0].action, 'created');
  });

  console.log('— updateInventory —');
  await test('updates price+stock by sku; unknown sku reported', async () => {
    const s = makeStrapi();
    await ingestCatalog(s, { origin_account_id: 'ACC', products: [P({ sku: 'SK', selling_price: 100, stock_quantity: 1 })] });
    const { results } = await updateInventory(s, [
      { sku: 'SK', quantity: 9, price: 250, salePrice: 200 },
      { sku: 'NOPE', quantity: 1 },
    ]);
    assert.strictEqual(results[0].ok, true);
    assert.strictEqual(results[1].ok, false);
    assert.strictEqual(results[1].error, 'unknown sku');
    const prod = s._tables['api::product.product'].find((r) => r.sku === 'SK');
    assert.strictEqual(prod.stock_quantity, 9);
    assert.strictEqual(prod.selling_price, 250);
    assert.strictEqual(prod.offer_price, 200);
  });
  await test('non-positive price/salePrice ignored (not written)', async () => {
    const s = makeStrapi();
    await ingestCatalog(s, { origin_account_id: 'ACC', products: [P({ sku: 'SK', selling_price: 100 })] });
    await updateInventory(s, [{ sku: 'SK', quantity: 0, price: 0, salePrice: -5 }]);
    const prod = s._tables['api::product.product'].find((r) => r.sku === 'SK');
    assert.strictEqual(prod.selling_price, 100); // unchanged
    assert.strictEqual(prod.stock_quantity, 0);  // 0 is a valid stock value
  });

  console.log('— batch isolation —');
  await test('one failing product does not abort the batch', async () => {
    const s = makeStrapi();
    // force a failure on the 2nd by making documents.create throw for a poison sku
    const origDocs = s.documents;
    s.documents = (uid) => {
      const d = origDocs(uid);
      const origCreate = d.create;
      d.create = async ({ data }) => { if (data.sku === 'POISON') throw new Error('boom'); return origCreate({ data }); };
      return d;
    };
    const { results } = await ingestCatalog(s, { origin_account_id: 'ACC', products: [
      P({ sku: 'GOOD1', slug: 'g1', barcode: 'BG1' }),
      P({ sku: 'POISON', slug: 'gp', barcode: 'BGP' }),
      P({ sku: 'GOOD2', slug: 'g2', barcode: 'BG2' }),
    ] });
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].ok, true);
    assert.strictEqual(results[1].ok, false);
    assert.strictEqual(results[2].ok, true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
