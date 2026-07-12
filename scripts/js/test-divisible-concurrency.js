'use strict';

/**
 * Headless correctness test for the divisible allocation engine (Phase 2).
 * Boots Strapi (load only), creates a throwaway divisible product with a single
 * roll of capacity N, then:
 *
 *   1. CONCURRENCY: fires K parallel allocations of M units each and asserts the
 *      roll's units_sold equals the total actually reported allocated — i.e. no
 *      lost updates (pre-fix, two racers would overwrite each other → oversell).
 *   2. OVER-ALLOCATION: asks for more than remains and asserts `insufficient`.
 *   3. RELEASE round-trip: releases the allocations and asserts units_sold
 *      returns to 0 and a depleted roll reopens InStock.
 *   4. EXPIRED exclusion: an expired roll is never allocated.
 *
 * Cleans up its throwaway rows. Prints PASS/FAIL per check; exit 1 on any fail.
 */

const path = require('path');
const APP_DIR = path.resolve(__dirname, '..', '..', 'pos-strapi');
const { compileStrapi, createStrapi } = require(require.resolve('@strapi/strapi', { paths: [APP_DIR] }));

const PRODUCT_UID = 'api::product.product';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

(async () => {
  process.chdir(APP_DIR);
  const app = await createStrapi(await compileStrapi({ appDir: APP_DIR, distDir: path.join(APP_DIR, 'dist') })).load();
  const svc = app.service(STOCK_ITEM_UID);
  const created = { products: [], items: [] };

  try {
    // ---- fixture: divisible product + one 100-unit roll ----
    const product = await app.db.query(PRODUCT_UID).create({
      data: { name: `__probe_divisible_${Date.now()}`, divisible: true, selling_price: 100, stock_quantity: 0 },
    });
    created.products.push(product.id);
    const roll = await app.db.query(STOCK_ITEM_UID).create({
      data: { product: product.id, status: 'InStock', sellable_units: 100, units_sold: 0, selling_price: 100, cost_price: 40 },
    });
    created.items.push(roll.id);

    // ---- 1. concurrency: 10 parallel × 8 units on a 100-unit roll ----
    const K = 10, M = 8;
    const results = await Promise.all(
      Array.from({ length: K }, () => svc.allocateSellableUnits(product.id, M).catch((e) => ({ error: e.message }))),
    );
    const allocatedUnits = results.reduce((s, r) => s + (Number(r?.totalUnits) || 0), 0);
    const after = await app.db.query(STOCK_ITEM_UID).findOne({ where: { id: roll.id }, select: ['units_sold'] });
    check('concurrency: units_sold matches reported allocations (no lost update)',
      Math.abs(Number(after.units_sold) - allocatedUnits) < 1e-6,
      `units_sold=${after.units_sold}, reportedAllocated=${allocatedUnits}, expected=${K * M}`);
    check('concurrency: no over-allocation beyond capacity', Number(after.units_sold) <= 100 + 1e-6, `units_sold=${after.units_sold}`);

    // ---- 2. over-allocation guard ----
    const remaining = 100 - Number(after.units_sold);
    const over = await svc.allocateSellableUnits(product.id, remaining + 50);
    check('over-allocation returns insufficient', over.insufficient === true, `available=${over.available}`);

    // ---- 3. release round-trip ----
    const flat = results.filter((r) => Array.isArray(r?.allocations)).flatMap((r) => r.allocations);
    await svc.releaseSellableUnits(flat, { productId: product.id });
    const afterRelease = await app.db.query(STOCK_ITEM_UID).findOne({ where: { id: roll.id }, select: ['units_sold', 'status'] });
    check('release restores units_sold to 0', Math.abs(Number(afterRelease.units_sold)) < 1e-6, `units_sold=${afterRelease.units_sold}`);
    check('release reopens roll to InStock', afterRelease.status === 'InStock', `status=${afterRelease.status}`);

    // ---- 4. expired exclusion ----
    const expiredRoll = await app.db.query(STOCK_ITEM_UID).create({
      data: { product: product.id, status: 'InStock', sellable_units: 100, units_sold: 0, selling_price: 100, cost_price: 40, expiry_date: '2000-01-01' },
    });
    created.items.push(expiredRoll.id);
    // Deplete the good roll so only the expired one could satisfy demand.
    await svc.allocateSellableUnits(product.id, 100);
    const expiredTry = await svc.allocateSellableUnits(product.id, 5);
    check('expired roll is not allocated', expiredTry.insufficient === true, `got ${JSON.stringify(expiredTry.allocations || [])}`);
  } catch (e) {
    console.error('test error:', e);
    failures++;
  } finally {
    for (const id of created.items) { try { await app.db.query(STOCK_ITEM_UID).delete({ where: { id } }); } catch (_) {} }
    for (const id of created.products) { try { await app.db.query(PRODUCT_UID).delete({ where: { id } }); } catch (_) {} }
    await app.destroy();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
