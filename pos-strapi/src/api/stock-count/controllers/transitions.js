'use strict';

/**
 * Stock-count transitions — post / cancel.
 *
 * Post compares each line's counted quantity against the current system on-hand
 * (live count of InStock units of that product at the count's warehouse). A
 * shortage (counted < system) books a loss: the surplus units go to status
 * 'Lost' (the stock-item lifecycle recomputes the caches). Overages are reported
 * but not auto-created in v1 (which specific found units to add is ambiguous).
 * The recomputed system_qty is written back onto each line for the record.
 *
 * Cancel is allowed only from Draft (a posted count's losses aren't reverted
 * because the specific units aren't tracked back to the count in v1).
 *
 * Auth is manual (auth:false routes). Posting a count books stock losses, so
 * it requires an inventory/stock manager or admin app-role.
 */

const { requireAppRole } = require('../../../utils/require-admin');

const COUNT_UID = 'api::stock-count.stock-count';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const PRODUCT_UID = 'api::product.product';

const requireCountManager = (ctx, strapi) => requireAppRole(ctx, strapi, {
  domains: ['inventory', 'stock'],
  levels: ['admin', 'manager'],
});

async function loadCount(strapi, ref) {
  if (ref == null || ref === '') return null;
  const where = (typeof ref === 'number' || /^\d+$/.test(String(ref)))
    ? { id: Number(ref) }
    : { documentId: String(ref) };
  return strapi.db.query(COUNT_UID).findOne({
    where,
    select: ['id', 'documentId', 'status', 'count_number'],
    populate: {
      warehouse: { select: ['id', 'documentId', 'name'] },
      lines: true,
    },
  });
}

// Count InStock units of a product-document at a warehouse, oldest first.
async function inStockUnits(strapi, productDocId, warehouseId) {
  const where = {
    status: 'InStock',
    $or: [{ archived: false }, { archived: { $null: true } }],
    warehouse: warehouseId,
  };
  if (productDocId) where.product = { documentId: productDocId };
  return strapi.db.query(STOCK_ITEM_UID).findMany({
    where, select: ['id', 'documentId'], orderBy: { createdAt: 'asc' }, limit: 100000,
  });
}

module.exports = {
  // POST /stock-counts/:id/post
  async post(ctx) {
    const user = await requireCountManager(ctx, strapi);
    if (!user) return;

    const count = await loadCount(strapi, ctx.params.id);
    if (!count) return ctx.notFound('Count not found');
    if (count.status !== 'Draft') return ctx.badRequest(`Cannot post a count in status ${count.status}`);
    const whId = count.warehouse?.id;
    if (!whId) return ctx.badRequest('Count has no warehouse');

    const lines = count.lines || [];
    if (lines.length === 0) return ctx.badRequest('Count has no lines');

    let shortageUnits = 0, overageUnits = 0, linesWithVariance = 0;
    const results = [];
    const newLines = [];

    for (const line of lines) {
      const counted = Number(line.counted_qty) || 0;
      const units = line.product_doc_id ? await inStockUnits(strapi, line.product_doc_id, whId) : [];
      const system = units.length;
      const variance = counted - system;

      if (variance < 0) {
        const toLose = units.slice(0, system - counted);
        for (const u of toLose) {
          await strapi.entityService.update(STOCK_ITEM_UID, u.id, { data: { status: 'Lost' } });
        }
        shortageUnits += (system - counted);
        linesWithVariance += 1;
      } else if (variance > 0) {
        overageUnits += variance;
        linesWithVariance += 1;
      }

      results.push({ product: line.product_name || line.product_doc_id, system, counted, variance });
      newLines.push({ product_doc_id: line.product_doc_id, product_name: line.product_name, sku: line.sku, system_qty: system, counted_qty: counted });
    }

    await strapi.entityService.update(COUNT_UID, count.id, {
      data: { status: 'Posted', posted_at: new Date().toISOString(), lines: newLines },
    });

    strapi.log.info(`[stock-count] ${count.count_number} posted — shortage ${shortageUnits}, overage ${overageUnits} by ${user.email || user.id}`);
    return ctx.send({ success: true, status: 'Posted', linesWithVariance, shortageUnits, overageUnits, results });
  },

  // POST /stock-counts/:id/cancel
  async cancel(ctx) {
    const user = await requireCountManager(ctx, strapi);
    if (!user) return;

    const count = await loadCount(strapi, ctx.params.id);
    if (!count) return ctx.notFound('Count not found');
    if (count.status !== 'Draft') return ctx.badRequest(`Only Draft counts can be cancelled (this is ${count.status})`);

    await strapi.entityService.update(COUNT_UID, count.id, { data: { status: 'Cancelled' } });
    return ctx.send({ success: true, status: 'Cancelled' });
  },
};
