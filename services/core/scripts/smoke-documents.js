#!/usr/bin/env node
'use strict';

/**
 * Smoke test for the documents() shim read path, cross-checked against raw SQL
 * on the live database. Read-only.
 *
 * Usage: npm run smoke --workspace-ignored (node services/core/scripts/smoke-documents.js)
 */

const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const db = getDb();

  // 1. count() vs raw SQL — published + draft products
  const [{ c: publishedSql }] = await db('products').whereNotNull('published_at').count('id as c');
  const [{ c: draftSql }] = await db('products').whereNull('published_at').count('id as c');
  const publishedShim = await documents('api::product.product').count({ status: 'published' });
  const draftShim = await documents('api::product.product').count({});
  check('product count (published)', publishedShim === Number(publishedSql),
    `shim=${publishedShim} sql=${publishedSql}`);
  check('product count (draft default)', draftShim === Number(draftSql),
    `shim=${draftShim} sql=${draftSql}`);

  // 2. findMany with filter + sort + populate
  const prods = await documents('api::product.product').findMany({
    status: 'published',
    filters: { name: { $containsi: 'a' } },
    sort: 'name:asc',
    limit: 5,
    populate: { categories: true, logo: true, parent: true, owners: true },
  });
  check('findMany returns rows', prods.length > 0, 'no published products matching name~a');
  if (prods.length) {
    const p = prods[0];
    check('row has documentId', typeof p.documentId === 'string' && p.documentId.length > 0);
    check('row maps scalar attrs', 'selling_price' in p && 'name' in p);
    check('populate categories is array', Array.isArray(p.categories));
    check('populate parent is object|null', p.parent === null || typeof p.parent === 'object');
    check('populate owners projects safe fields',
      p.owners.every((o) => !('password' in o) && !('reset_password_token' in o)));

    // categories cross-check against link table for the first product
    const sqlCats = await db('products_categories_lnk as l')
      .join('categories as c', 'c.id', 'l.category_id')
      .where('l.product_id', p.id)
      .whereNotNull('c.published_at')
      .orderBy('l.category_ord', 'asc')
      .pluck('c.id');
    check('categories match link table',
      JSON.stringify(p.categories.map((c) => c.id)) === JSON.stringify(sqlCats),
      `shim=[${p.categories.map((c) => c.id)}] sql=[${sqlCats}]`);

    // sort order check
    const names = prods.map((x) => (x.name || '').toLowerCase());
    const sorted = [...names].sort();
    check('sorted by name asc', JSON.stringify(names) === JSON.stringify(sorted));

    // 3. findOne round-trip
    const one = await documents('api::product.product').findOne({
      documentId: p.documentId, status: 'published',
    });
    check('findOne by documentId round-trip', one && one.id === p.id);
  }

  // 4. sale-order: component populate with nested relation + person relation
  const order = await documents('api::sale-order.sale-order').findFirst({
    sort: 'createdAt:desc',
    populate: {
      customer_person: true,
      products: { populate: { items: { populate: { product: true } } } },
    },
  });
  if (!order) {
    console.log('  SKIP  sale-order checks (no draft sale-orders in DB)');
  } else {
    check('sale-order has products component', order.products !== undefined);
    const wrapper = Array.isArray(order.products) ? order.products[0] : order.products;
    if (wrapper) {
      check('component row mapped (has id)', typeof wrapper.id === 'number');
      const item = Array.isArray(wrapper.items) ? wrapper.items[0] : wrapper.items;
      check('nested component items populated', wrapper.items !== undefined);
      if (item) {
        check('component→component→relation product populated',
          item.product === null || (item.product && typeof item.product.documentId === 'string'));
      }
    }
    check('customer_person relation object|null',
      order.customer_person === null || typeof order.customer_person === 'object');
  }

  // 5. relation filter (EXISTS subquery): products in some category
  const anyCat = await db('categories').whereNotNull('published_at').first('id', 'name');
  if (anyCat) {
    const viaShim = await documents('api::product.product').count({
      status: 'published',
      filters: { categories: { id: { $eq: anyCat.id } } },
    });
    const [{ c: viaSql }] = await db('products as p')
      .whereNotNull('p.published_at')
      .whereExists(function () {
        this.select(1).from('products_categories_lnk as l')
          .join('categories as c', 'c.id', 'l.category_id')
          .whereRaw('l.product_id = p.id')
          .where('c.id', anyCat.id);
      })
      .count('p.id as c');
    check(`relation filter count (category "${anyCat.name}")`, viaShim === Number(viaSql),
      `shim=${viaShim} sql=${viaSql}`);
  }

  console.log(failures === 0 ? '\nSMOKE: all checks passed' : `\nSMOKE: ${failures} check(s) FAILED`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('smoke failed:', err);
  await closeDb();
  process.exit(2);
});
