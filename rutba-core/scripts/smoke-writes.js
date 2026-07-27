#!/usr/bin/env node
'use strict';

/**
 * Write-path smoke test. Creates marker-named rows on the dev DB, exercises
 * create/update/publish/unpublish/delete (incl. components and link tables),
 * verifies against raw SQL, and cleans up everything it created — including
 * on failure (finally block deletes all marker documents).
 */

const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');

const MARKER = '__rutba_core_write_smoke__';
let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function cleanup(db) {
  for (const [uid, table, nameCol] of [
    ['api::sale-order.sale-order', 'orders', 'order_id'],
    ['api::product.product', 'products', 'name'],
  ]) {
    const rows = await db(table).where(nameCol, 'like', `${MARKER}%`).select('document_id').groupBy('document_id');
    for (const r of rows) await documents(uid).delete({ documentId: r.document_id });
  }
}

async function main() {
  const db = getDb();
  const products = documents('api::product.product');
  const orders = documents('api::sale-order.sale-order');

  try {
    // Pick two existing draft categories to relate to.
    const cats = await documents('api::category.category').findMany({ limit: 2, sort: 'id:asc' });
    check('found 2 draft categories to test with', cats.length === 2);
    const [catA, catB] = cats;

    // ── create ────────────────────────────────────────────────
    const created = await products.create({
      data: {
        name: `${MARKER} v1`,
        selling_price: 123.45,
        keywords: { smoke: true, n: 7 },
        categories: [catA.id, catB.documentId], // mixed id + documentId inputs
      },
      populate: { categories: true },
    });
    check('create returns document', created && typeof created.documentId === 'string');
    check('create is draft (publishedAt null)', created.publishedAt === null);
    check('json attr round-trips', created.keywords && created.keywords.n === 7);
    check('create relations set (2 categories, order kept)',
      JSON.stringify((created.categories || []).map((c) => c.id)) === JSON.stringify([catA.id, catB.id]),
      JSON.stringify((created.categories || []).map((c) => c.id)));
    const docId = created.documentId;

    // ── update: scalars + disconnect/connect ──────────────────
    const updated = await products.update({
      documentId: docId,
      data: {
        name: `${MARKER} v2`,
        categories: { disconnect: [catA.id], connect: [] },
      },
      populate: { categories: true },
    });
    check('update scalar applied', updated.name === `${MARKER} v2`);
    check('disconnect leaves 1 category',
      updated.categories.length === 1 && updated.categories[0].id === catB.id);

    const reconnected = await products.update({
      documentId: docId,
      data: { categories: { connect: [catA.id] } },
      populate: { categories: true },
    });
    check('connect appends (2 categories)', reconnected.categories.length === 2);

    // ── publish: clone + target remap ─────────────────────────
    const published = await products.publish({ documentId: docId, populate: { categories: true } });
    check('publish creates published version', published && published.publishedAt !== null);
    check('published shares documentId', published.documentId === docId);
    check('published id differs from draft id', published.id !== created.id);
    const pubCatRows = await db('categories').whereIn('id', published.categories.map((c) => c.id))
      .select('published_at');
    check('published links remap to published categories',
      pubCatRows.length === published.categories.length &&
      pubCatRows.every((r) => r.published_at !== null));

    // re-publish is idempotent (replaces the published version)
    await products.publish({ documentId: docId });
    const versions = await db('products').where('document_id', docId).count('id as c');
    check('re-publish keeps exactly 2 versions', Number(versions[0].c) === 2);

    // ── unpublish ─────────────────────────────────────────────
    await products.unpublish({ documentId: docId });
    const afterUnpub = await db('products').where('document_id', docId).whereNotNull('published_at').count('id as c');
    check('unpublish removes published version', Number(afterUnpub[0].c) === 0);

    // ── sale-order with nested components ─────────────────────
    const order = await orders.create({
      data: {
        order_id: `${MARKER}-SO`,
        products: {
          items: [
            { product: created.id, quantity: 2, price: 100, total: 200, product_name: 'smoke item A' },
            { product: { documentId: docId }, quantity: 1, price: 50, total: 50, product_name: 'smoke item B' },
          ],
        },
      },
      populate: { products: { populate: { items: { populate: { product: true } } } } },
    });
    check('order created with component wrapper', order.products && order.products.items);
    const items = order.products.items || [];
    check('nested repeatable items (2, ordered)',
      items.length === 2 && items[0].product_name === 'smoke item A');
    check('component relation resolves via id and documentId',
      items.every((i) => i.product && i.product.documentId === docId));

    // ── delete: full graph teardown ───────────────────────────
    const orderRowId = order.id;
    const itemIds = items.map((i) => i.id);
    await orders.delete({ documentId: order.documentId });
    const [orphanWrappers] = await db('orders_cmps').where('entity_id', orderRowId).count('id as c');
    const [orphanItems] = await db('components_order_order_product_items').whereIn('id', itemIds).count('id as c');
    check('order cmps rows gone', Number(orphanWrappers.c) === 0);
    check('nested component rows gone', Number(orphanItems.c) === 0);

    await products.delete({ documentId: docId });
    const [prodRows] = await db('products').where('document_id', docId).count('id as c');
    const [linkRows] = await db('products_categories_lnk as l')
      .join('products as p', 'p.id', 'l.product_id').where('p.document_id', docId).count('l.id as c');
    check('product versions gone', Number(prodRows.c) === 0);
    check('product link rows gone (cascade)', Number(linkRows.c) === 0);

    // ── caller-scoped transaction: rollback undoes shim writes ──
    const { withTransaction } = require('../src/db/connection');
    let trxDocId = null;
    try {
      await withTransaction(async () => {
        const p = await products.create({ data: { name: `${MARKER} trx` } });
        trxDocId = p.documentId;
        throw new Error('force rollback');
      });
    } catch (e) {
      if (e.message !== 'force rollback') throw e;
    }
    const [trxRows] = await db('products').where('document_id', trxDocId).count('id as c');
    check('transaction rollback leaves no rows', Number(trxRows.c) === 0, `docId=${trxDocId}`);
  } finally {
    await cleanup(db);
  }

  console.log(failures === 0 ? '\nWRITE SMOKE: all checks passed' : `\nWRITE SMOKE: ${failures} check(s) FAILED`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('write smoke failed:', err);
  try { await cleanup(getDb()); } catch {}
  await closeDb();
  process.exit(2);
});
