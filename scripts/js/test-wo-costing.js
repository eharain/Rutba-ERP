'use strict';

/**
 * Headless proof for the Phase 3 WO-costing fix: material cost must be
 * capitalized into a work order (and its finished goods), not dropped to 0.
 *
 * Pre-fix, costing was computed BEFORE auto-consume created the material-issue
 * rows, so in the auto-consume flow material_cost was always 0. This builds a
 * minimal WO (output product + a BOM consuming 10 units of a bulk input lot at
 * cost 5) and walks it Draft→Released→InProgress→Completed, then asserts the
 * persisted material_cost ≈ 50 and the finished stock-item's cost_price includes
 * it. Cleans up its throwaway rows.
 */

const path = require('path');
const APP_DIR = path.resolve(__dirname, '..', '..', 'pos-strapi');
const { compileStrapi, createStrapi } = require(require.resolve('@strapi/strapi', { paths: [APP_DIR] }));

const PRODUCT_UID = 'api::product.product';
const BOM_UID = 'api::mfg-bom.mfg-bom';
const LOT_UID = 'api::mfg-material-lot.mfg-material-lot';
const WO_UID = 'api::mfg-work-order.mfg-work-order';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const ISSUE_UID = 'api::mfg-material-issue.mfg-material-issue';

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

(async () => {
  process.chdir(APP_DIR);
  const app = await createStrapi(await compileStrapi({ appDir: APP_DIR, distDir: path.join(APP_DIR, 'dist') })).load();
  const sm = require(path.join(APP_DIR, 'src/api/mfg-work-order/services/mfg-work-order-state-machine.js'));
  const cleanup = { products: [], boms: [], lots: [], wos: [], items: [], issues: [] };

  try {
    const stamp = 900000 + Math.floor(Number(process.pid) % 90000);
    const output = await app.documents(PRODUCT_UID).create({ data: { name: `__probe_wo_out_${stamp}`, track_mode: 'serialized', selling_price: 200 } });
    const input = await app.documents(PRODUCT_UID).create({ data: { name: `__probe_wo_in_${stamp}`, track_mode: 'bulk', unit_of_measure: 'meter' } });
    cleanup.products.push(output.id, input.id);

    const lot = await app.documents(LOT_UID).create({
      data: { product: input.documentId, quantity_received: 1000, quantity_remaining: 1000, unit_cost: 5, status: 'Available', uom: 'meter' },
    });
    cleanup.lots.push(lot.id);

    const bom = await app.documents(BOM_UID).create({
      data: {
        name: `__probe_bom_${stamp}`,
        product: output.documentId,
        status: 'Draft',
        output_quantity: 1,
        material_lines: [{ material_product: input.documentId, quantity: 10, uom: 'meter', wastage_pct: 0 }],
      },
    });
    cleanup.boms.push(bom.id);

    let wo = await app.documents(WO_UID).create({
      data: { name: `__probe_WO_${stamp}`, wo_number: `__probe_WO_${stamp}`, product: output.documentId, bom: bom.documentId, quantity_ordered: 1, status: 'Draft' },
    });
    cleanup.wos.push(wo.id);

    await sm.executeTransition(wo.documentId, 'Released', {});
    await sm.executeTransition(wo.documentId, 'InProgress', {});
    await sm.executeTransition(wo.documentId, 'Completed', { quantity_finished: 1 });

    const done = await app.db.query(WO_UID).findOne({ where: { id: wo.id }, select: ['material_cost', 'total_cost', 'cost_per_unit'] });
    const expectMaterial = 10 * 5; // 10 meters × 5
    check('WO material_cost captures consumed inputs', Math.abs(Number(done.material_cost) - expectMaterial) < 0.01, `material_cost=${done.material_cost}, expected≈${expectMaterial}`);
    check('WO total_cost ≥ material_cost', Number(done.total_cost) >= expectMaterial - 0.01, `total_cost=${done.total_cost}`);

    // The material-issue ledger should carry the consumed cost.
    const issues = await app.db.query(ISSUE_UID).findMany({ where: { work_order: wo.id }, select: ['id', 'total_cost'] });
    issues.forEach((i) => cleanup.issues.push(i.id));
    const issueCost = issues.reduce((s, i) => s + (Number(i.total_cost) || 0), 0);
    check('material-issue ledger has non-zero cost', issueCost > 0, `Σ issue total_cost=${issueCost}`);

    // Finished stock-item cost_price should reflect the full unit cost (incl material).
    const finished = await app.db.query(STOCK_ITEM_UID).findMany({ where: { work_order: wo.id }, select: ['id', 'cost_price'] });
    finished.forEach((f) => cleanup.items.push(f.id));
    check('finished goods created', finished.length > 0, `count=${finished.length}`);
    if (finished.length) {
      check('finished cost_price includes material cost', Number(finished[0].cost_price) >= expectMaterial - 0.01, `cost_price=${finished[0].cost_price}`);
    }
  } catch (e) {
    console.error('test error:', e);
    failures++;
  } finally {
    for (const id of cleanup.items) { try { await app.db.query(STOCK_ITEM_UID).delete({ where: { id } }); } catch (_) {} }
    for (const id of cleanup.issues) { try { await app.db.query(ISSUE_UID).delete({ where: { id } }); } catch (_) {} }
    for (const id of cleanup.wos) { try { await app.db.query(WO_UID).delete({ where: { id } }); } catch (_) {} }
    for (const id of cleanup.boms) { try { await app.db.query(BOM_UID).delete({ where: { id } }); } catch (_) {} }
    for (const id of cleanup.lots) { try { await app.db.query(LOT_UID).delete({ where: { id } }); } catch (_) {} }
    for (const id of cleanup.products) { try { await app.db.query(PRODUCT_UID).delete({ where: { id } }); } catch (_) {} }
    await app.destroy();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
