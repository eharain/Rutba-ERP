'use strict';

/**
 * Inventory Foundation backfill (Epic 2 Phase 1) — CLI runner + self-check.
 *
 * The backfill itself now lives in the seed registry
 * (src/seed/seeders/inventory-foundation.js) so it survives a DB refresh and is
 * runnable from the control app / CLI:
 *
 *   node scripts/seed.js --only=inventory-foundation
 *
 * This script is kept as a direct entrypoint that ALSO runs the load-bearing
 * self-check (Σ stock-level.quantity_on_hand === count(eligible InStock items))
 * and prints a JSON report. Boots Strapi load-only (no HTTP listen — safe while
 * the dev server is up).
 *
 * Run from pos-strapi:  DATABASE_NAME=pos_db node scripts/backfill-inventory-foundation.js
 * Or via the workspace env loader:
 *   node scripts/js/load-env.js -- npm --prefix pos-strapi run backfill:inventory-foundation
 */

const { createStrapi, compileStrapi } = require('@strapi/strapi');
const { backfillInventoryFoundation } = require('../src/seed/seeders/inventory-foundation');

const STOCK_ITEM = 'api::stock-item.stock-item';
const STOCK_LEVEL = 'api::stock-level.stock-level';
const PRODUCT = 'api::product.product';
const WAREHOUSE = 'api::warehouse.warehouse';
const LOCATION = 'api::storage-location.storage-location';

async function main() {
  const app = await createStrapi(await compileStrapi()).load();
  app.log.level = 'error';
  const out = {};

  try {
    const svc = app.service(STOCK_ITEM);

    out.before = {
      warehouses: await app.db.query(WAREHOUSE).count(),
      locations: await app.db.query(LOCATION).count(),
      stockLevels: await app.db.query(STOCK_LEVEL).count(),
      stockItems: await app.db.query(STOCK_ITEM).count(),
      products: await app.db.query(PRODUCT).count(),
    };

    // Shared registry seeder does the actual backfill.
    const seeded = await backfillInventoryFoundation(app);
    out.backfill = seeded.backfill;

    out.after = {
      warehouses: await app.db.query(WAREHOUSE).count(),
      locations: await app.db.query(LOCATION).count(),
      stockLevels: await app.db.query(STOCK_LEVEL).count(),
    };

    out.unplacedItemsRemaining = await app.db.query(STOCK_ITEM).count({
      where: { warehouse: null },
    });

    // Edition-proof invariant: Σ stock-level.quantity_on_hand must equal the
    // count of InStock units that CAN belong to a (product, warehouse) bucket —
    // excluding orphan (no product) and unplaced (no warehouse) items, which are
    // likewise absent from product.stock_quantity.
    const prodLnk = svc._relJoinInfo(STOCK_ITEM, 'product');
    const whLnk = svc._relJoinInfo(STOCK_ITEM, 'warehouse');
    const stockTable = app.db.metadata.get(STOCK_ITEM).tableName;
    const knex = app.db.connection;

    const totalInStock = await app.db.query(STOCK_ITEM).count({
      where: { status: 'InStock', $or: [{ archived: false }, { archived: { $null: true } }] },
    });

    let eligibleInStock = null;
    try {
      const row = await knex(`${stockTable} as si`)
        .whereRaw("si.status = 'InStock'")
        .andWhereRaw('(si.archived = 0 or si.archived is null)')
        .whereExists(function () { this.select(1).from(`${prodLnk.table} as p`).whereRaw(`p.${prodLnk.itemCol} = si.id`); })
        .whereExists(function () { this.select(1).from(`${whLnk.table} as w`).whereRaw(`w.${whLnk.itemCol} = si.id`); })
        .count({ c: '*' }).first();
      eligibleInStock = Number(row.c);
    } catch (err) {
      out.eligibleError = err.message;
    }

    const allLevels = await app.db.query(STOCK_LEVEL).findMany({ select: ['quantity_on_hand'] });
    const globalSumLevels = (allLevels || []).reduce((s, l) => s + (Number(l.quantity_on_hand) || 0), 0);

    out.globalAggregate = {
      totalInStock,
      eligibleInStock,
      orphanOrUnplaced: eligibleInStock == null ? null : totalInStock - eligibleInStock,
      sumStockLevels: globalSumLevels,
      match: eligibleInStock === globalSumLevels,
    };

    // Duplicate detection (edition-proof): at most one warehouse-level
    // stock-level row per (product-document, warehouse).
    const levelRows = await app.db.query(STOCK_LEVEL).findMany({
      select: ['id'],
      populate: {
        product: { select: ['documentId'] },
        warehouse: { select: ['id'] },
        storage_location: { select: ['id'] },
        batch: { select: ['id'] },
      },
    });
    const keys = new Set();
    let duplicateRows = 0;
    let finerGrainedRows = 0;
    for (const r of levelRows || []) {
      if (r.storage_location?.id || r.batch?.id) { finerGrainedRows += 1; continue; }
      const k = `${r.product?.documentId || '?'}|${r.warehouse?.id || 0}`;
      if (keys.has(k)) duplicateRows += 1;
      else keys.add(k);
    }
    out.stockLevelRows = {
      total: (levelRows || []).length,
      warehouseLevelDistinct: keys.size,
      duplicateRows,
      finerGrainedRows,
    };
    out.result = (out.unplacedItemsRemaining === 0
      && out.globalAggregate.match
      && duplicateRows === 0) ? 'PASS' : 'REVIEW';
  } catch (e) {
    out.error = e.message;
    out.stack = e.stack;
  } finally {
    console.log('===FOUNDATION-VERIFY===');
    console.log(JSON.stringify(out, null, 2));
    await app.destroy();
  }
  process.exit(out.error ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
