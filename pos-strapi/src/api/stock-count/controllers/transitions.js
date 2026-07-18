'use strict';

/**
 * Stock-count transitions — post / cancel.
 *
 * Post compares each line's counted quantity against the current system on-hand
 * (live count of InStock units of that product at the count's branch). A
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

const COUNT_SOURCE_TYPE = 'Stock Count';

// Best-effort loss GL for count shrinkage: Dr SHRINKAGE_EXPENSE / Cr INVENTORY,
// mirroring the stock-adjustment path so a count-driven loss and an
// adjustment-driven loss hit the books identically. Idempotent (findBySource);
// never throws — a missing COA mapping just skips it with a log.
async function postCountLossGL(strapi, count, totalCost, user) {
  try {
    if (!(Number(totalCost) > 0)) return { posted: false, reason: 'zero cost basis' };
    const accounting = strapi.service('api::acc-journal-entry.accounting');
    const resolver = strapi.service('api::acc-journal-entry.account-resolver');
    if (!accounting || !resolver) return { posted: false, reason: 'accounting engine unavailable' };

    const existing = await accounting.findBySource(COUNT_SOURCE_TYPE, count.id);
    if (existing && existing.length) return { posted: true, reason: 'already posted' };

    let invAcc, expAcc;
    try {
      invAcc = await resolver.resolve('INVENTORY', null);
      expAcc = await resolver.resolve('SHRINKAGE_EXPENSE', null);
    } catch (e) {
      return { posted: false, reason: `account mapping missing (${e.message})` };
    }

    await accounting.createAndPost({
      date: new Date(),
      description: `Stock count shrinkage — ${count.count_number}`,
      source_type: COUNT_SOURCE_TYPE,
      source_id: count.id,
      source_ref: count.count_number,
      posted_by: user.email || String(user.id),
      lines: [
        { account: expAcc, debit: totalCost, credit: 0, description: 'Count shrinkage' },
        { account: invAcc, debit: 0, credit: totalCost, description: 'Inventory reduction' },
      ],
    });
    return { posted: true, total: totalCost };
  } catch (e) {
    strapi.log.warn(`[stock-count] GL post failed (best-effort): ${e.message}`);
    return { posted: false, reason: e.message };
  }
}

async function loadCount(strapi, ref) {
  if (ref == null || ref === '') return null;
  const where = (typeof ref === 'number' || /^\d+$/.test(String(ref)))
    ? { id: Number(ref) }
    : { documentId: String(ref) };
  return strapi.db.query(COUNT_UID).findOne({
    where,
    select: ['id', 'documentId', 'status', 'count_number'],
    populate: {
      branch: { select: ['id', 'documentId', 'name'] },
      lines: true,
    },
  });
}

// Count InStock units of a product-document at a branch, oldest first.
// Dedupe by item id: filtering on the product's documentId joins across BOTH
// draft and published product editions, so a single stock-item can surface
// twice — which would double the system qty and flag good units as Lost.
async function inStockUnits(strapi, productDocId, branchId) {
  const where = {
    status: 'InStock',
    $or: [{ archived: false }, { archived: { $null: true } }],
    branch: branchId,
  };
  if (productDocId) where.product = { documentId: productDocId };
  const rows = await strapi.db.query(STOCK_ITEM_UID).findMany({
    where, select: ['id', 'documentId', 'cost_price'], orderBy: { createdAt: 'asc' }, limit: 100000,
  });
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

module.exports = {
  // POST /stock-counts/:id/post
  async post(ctx) {
    const user = await requireCountManager(ctx, strapi);
    if (!user) return;

    const count = await loadCount(strapi, ctx.params.id);
    if (!count) return ctx.notFound('Count not found');
    if (count.status !== 'Draft') return ctx.badRequest(`Cannot post a count in status ${count.status}`);
    const branchId = count.branch?.id;
    if (!branchId) return ctx.badRequest('Count has no branch');

    const lines = count.lines || [];
    if (lines.length === 0) return ctx.badRequest('Count has no lines');

    let shortageUnits = 0, overageUnits = 0, linesWithVariance = 0, shortageCost = 0;
    const results = [];
    const newLines = [];

    for (const line of lines) {
      const counted = Number(line.counted_qty) || 0;
      const units = line.product_doc_id ? await inStockUnits(strapi, line.product_doc_id, branchId) : [];
      const system = units.length;
      const variance = counted - system;

      if (variance < 0) {
        const toLose = units.slice(0, system - counted);
        for (const u of toLose) {
          await strapi.entityService.update(STOCK_ITEM_UID, u.id, { data: { status: 'Lost' } });
          shortageCost += Number(u.cost_price) || 0;
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

    // Book the shrinkage loss to the GL (same treatment as a stock-adjustment).
    const gl = await postCountLossGL(strapi, count, Math.round(shortageCost * 100) / 100, user);

    await strapi.entityService.update(COUNT_UID, count.id, {
      data: { status: 'Posted', posted_at: new Date().toISOString(), lines: newLines },
    });

    strapi.log.info(`[stock-count] ${count.count_number} posted — shortage ${shortageUnits}, overage ${overageUnits} (gl=${gl.posted}) by ${user.email || user.id}`);
    return ctx.send({ success: true, status: 'Posted', linesWithVariance, shortageUnits, overageUnits, shortageCost: Math.round(shortageCost * 100) / 100, gl, results });
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
