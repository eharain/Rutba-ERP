'use strict';

/**
 * Headless proof for the sub-unit POS return: after selling a portion of a
 * divisible roll, returning N sub-units restores exactly N to stock and shrinks
 * the sale-item's recorded allocations — without whole-flipping the roll.
 *
 * Fixture: a divisible product with one 100-unit roll. Sell 30 to a sale-item,
 * then return 12. Expect roll units_sold 30→18, sale-item sellable_qty 30→18,
 * and the returned refund basis to match 12 units of price.
 */

const path = require('path');
const APP_DIR = path.resolve(__dirname, '..', '..', 'pos-strapi');
const { compileStrapi, createStrapi } = require(require.resolve('@strapi/strapi', { paths: [APP_DIR] }));

const PRODUCT_UID = 'api::product.product';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const SALE_ITEM_UID = 'api::sale-item.sale-item';

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

(async () => {
  process.chdir(APP_DIR);
  const app = await createStrapi(await compileStrapi({ appDir: APP_DIR, distDir: path.join(APP_DIR, 'dist') })).load();
  const svc = app.service(STOCK_ITEM_UID);
  const cleanup = { products: [], items: [], saleItems: [] };

  try {
    const stamp = Date.now();
    const product = await app.db.query(PRODUCT_UID).create({ data: { name: `__probe_ret_${stamp}`, divisible: true, selling_price: 100, stock_quantity: 0 } });
    cleanup.products.push(product.id);
    const roll = await app.db.query(STOCK_ITEM_UID).create({
      data: { product: product.id, status: 'InStock', sellable_units: 100, units_sold: 0, selling_price: 100, cost_price: 40 },
    });
    cleanup.items.push(roll.id);

    // A sale-item to carry the allocation record.
    const saleItem = await app.documents(SALE_ITEM_UID).create({ data: { quantity: 1, product: product.documentId } });
    cleanup.saleItems.push(saleItem.id);

    // Sell 30 sub-units to the line.
    await svc.sellDivisibleUnits(product.documentId, 30, { saleItemDocId: saleItem.documentId });
    let rollAfterSell = await app.db.query(STOCK_ITEM_UID).findOne({ where: { id: roll.id }, select: ['units_sold'] });
    check('sold 30 → roll units_sold 30', Math.abs(Number(rollAfterSell.units_sold) - 30) < 1e-6, `units_sold=${rollAfterSell.units_sold}`);

    // Return 12 sub-units.
    const ret = await svc.returnDivisibleUnits(saleItem.documentId, 12);
    check('return reports 12 units', Math.abs(Number(ret.units) - 12) < 1e-6, `units=${ret.units}`);
    check('return refund basis = 12 × 1.0', Math.abs(Number(ret.refundBasis) - 12) < 0.01, `refundBasis=${ret.refundBasis} (unit price = 100/100 = 1)`);

    const rollAfterReturn = await app.db.query(STOCK_ITEM_UID).findOne({ where: { id: roll.id }, select: ['units_sold', 'status'] });
    check('roll units_sold 30 → 18 after returning 12', Math.abs(Number(rollAfterReturn.units_sold) - 18) < 1e-6, `units_sold=${rollAfterReturn.units_sold}`);
    check('roll stays InStock (never whole-flipped)', rollAfterReturn.status === 'InStock', `status=${rollAfterReturn.status}`);

    const siAfter = await app.documents(SALE_ITEM_UID).findOne({ documentId: saleItem.documentId, fields: ['sellable_qty', 'allocations'] });
    check('sale-item sellable_qty 30 → 18', Math.abs(Number(siAfter.sellable_qty) - 18) < 1e-6, `sellable_qty=${siAfter.sellable_qty}`);
    const remainUnits = (Array.isArray(siAfter.allocations) ? siAfter.allocations : []).reduce((s, a) => s + (Number(a.units) || 0), 0);
    check('sale-item allocations shrank to 18 units', Math.abs(remainUnits - 18) < 1e-6, `alloc units=${remainUnits}`);

    // Over-return is rejected.
    try { await svc.returnDivisibleUnits(saleItem.documentId, 999); check('over-return rejected', false, 'no error'); }
    catch (e) { check('over-return rejected', e.status === 400, e.message.slice(0, 50)); }
  } catch (e) {
    console.error('test error:', e);
    failures++;
  } finally {
    for (const id of cleanup.saleItems) { try { await app.db.query(SALE_ITEM_UID).delete({ where: { id } }); } catch (_) {} }
    for (const id of cleanup.items) { try { await app.db.query(STOCK_ITEM_UID).delete({ where: { id } }); } catch (_) {} }
    for (const id of cleanup.products) { try { await app.db.query(PRODUCT_UID).delete({ where: { id } }); } catch (_) {} }
    await app.destroy();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
