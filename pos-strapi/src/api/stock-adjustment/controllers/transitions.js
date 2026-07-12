'use strict';

/**
 * Stock-adjustment transitions — post / cancel.
 *
 * Post: each selected InStock unit is moved to a loss status (dropping it from
 * on-hand; the stock-item lifecycle recomputes the caches), then a best-effort
 * GL entry is posted — Dr SHRINKAGE_EXPENSE / Cr INVENTORY for the summed unit
 * cost. GL is idempotent (findBySource) and never blocks the stock adjustment:
 * if the COA mappings aren't configured it is skipped with a log.
 *
 * Cancel: reverts the units to InStock and reverses any posted GL.
 *
 * Auth is manual (auth:false routes) — same pattern as stock-items/transfer.
 * Posting/cancelling books losses and GL, so it requires an inventory/stock
 * manager or admin app-role (not just any authenticated user).
 */

const { requireAppRole } = require('../../../utils/require-admin');

const ADJ_UID = 'api::stock-adjustment.stock-adjustment';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const SOURCE_TYPE = 'Inventory Adjustment';

// Adjustment type -> the stock-item status the unit moves to on post.
const TYPE_TO_STATUS = { WriteOff: 'Reduced', Damage: 'Damaged', Lost: 'Lost', Expired: 'Expired' };

const requireAdjustmentManager = (ctx, strapi) => requireAppRole(ctx, strapi, {
  domains: ['inventory', 'stock'],
  levels: ['admin', 'manager'],
});

async function loadAdjustment(strapi, ref) {
  if (ref == null || ref === '') return null;
  const where = (typeof ref === 'number' || /^\d+$/.test(String(ref)))
    ? { id: Number(ref) }
    : { documentId: String(ref) };
  return strapi.db.query(ADJ_UID).findOne({
    where,
    select: ['id', 'documentId', 'status', 'type', 'adjustment_number', 'gl_posted'],
    populate: {
      warehouse: { select: ['id', 'documentId', 'name'], populate: { branch: { select: ['id'] } } },
      stock_items: { select: ['id', 'documentId', 'status', 'cost_price'] },
    },
  });
}

// Best-effort GL for a loss: Dr SHRINKAGE_EXPENSE / Cr INVENTORY. Never throws.
async function postLossGL(strapi, adj, units, user) {
  try {
    const accounting = strapi.service('api::acc-journal-entry.accounting');
    const resolver = strapi.service('api::acc-journal-entry.account-resolver');
    if (!accounting || !resolver) return { posted: false, reason: 'accounting engine unavailable' };

    const existing = await accounting.findBySource(SOURCE_TYPE, adj.id);
    if (existing && existing.length) return { posted: true, reason: 'already posted' };

    const total = units.reduce((s, u) => s + (Number(u.cost_price) || 0), 0);
    if (!(total > 0)) return { posted: false, reason: 'zero cost basis' };

    const branchId = adj.warehouse?.branch?.id || null;
    let invAcc, expAcc;
    try {
      invAcc = await resolver.resolve('INVENTORY', branchId);
      expAcc = await resolver.resolve('SHRINKAGE_EXPENSE', branchId);
    } catch (e) {
      return { posted: false, reason: `account mapping missing (${e.message})` };
    }

    await accounting.createAndPost({
      date: new Date(),
      description: `Inventory ${adj.type} — ${adj.adjustment_number}`,
      source_type: SOURCE_TYPE,
      source_id: adj.id,
      source_ref: adj.adjustment_number,
      branch: branchId,
      posted_by: user.email || String(user.id),
      lines: [
        { account: expAcc, debit: total, credit: 0, description: `${adj.type} write-off` },
        { account: invAcc, debit: 0, credit: total, description: 'Inventory reduction' },
      ],
    });
    return { posted: true, total };
  } catch (e) {
    strapi.log.warn(`[stock-adjustment] GL post failed (best-effort): ${e.message}`);
    return { posted: false, reason: e.message };
  }
}

module.exports = {
  // POST /stock-adjustments/:id/post
  async post(ctx) {
    const user = await requireAdjustmentManager(ctx, strapi);
    if (!user) return;

    const adj = await loadAdjustment(strapi, ctx.params.id);
    if (!adj) return ctx.notFound('Adjustment not found');
    if (adj.status !== 'Draft') return ctx.badRequest(`Cannot post an adjustment in status ${adj.status}`);

    const target = TYPE_TO_STATUS[adj.type] || 'Reduced';
    const units = adj.stock_items || [];
    if (units.length === 0) return ctx.badRequest('Adjustment has no units');

    const adjusted = [];
    const skipped = [];
    for (const u of units) {
      if (u.status !== 'InStock') { skipped.push({ documentId: u.documentId, status: u.status }); continue; }
      await strapi.entityService.update(STOCK_ITEM_UID, u.id, { data: { status: target } });
      adjusted.push(u);
    }

    const total_cost = adjusted.reduce((s, u) => s + (Number(u.cost_price) || 0), 0);
    const gl = await postLossGL(strapi, adj, adjusted, user);

    await strapi.entityService.update(ADJ_UID, adj.id, {
      data: { status: 'Posted', posted_at: new Date().toISOString(), total_cost, gl_posted: !!gl.posted },
    });

    strapi.log.info(`[stock-adjustment] ${adj.adjustment_number} posted ${adjusted.length} -> ${target} (gl=${gl.posted}) by ${user.email || user.id}`);
    return ctx.send({ success: true, status: 'Posted', adjusted: adjusted.length, skipped, total_cost, gl });
  },

  // POST /stock-adjustments/:id/cancel
  async cancel(ctx) {
    const user = await requireAdjustmentManager(ctx, strapi);
    if (!user) return;

    const adj = await loadAdjustment(strapi, ctx.params.id);
    if (!adj) return ctx.notFound('Adjustment not found');
    if (!['Draft', 'Posted'].includes(adj.status)) {
      return ctx.badRequest(`Cannot cancel an adjustment in status ${adj.status}`);
    }

    let reverted = 0;
    let glReversed = false;
    if (adj.status === 'Posted') {
      const lossStatuses = new Set(Object.values(TYPE_TO_STATUS));
      for (const u of (adj.stock_items || [])) {
        if (!lossStatuses.has(u.status)) continue; // only revert units this adjustment moved
        await strapi.entityService.update(STOCK_ITEM_UID, u.id, { data: { status: 'InStock' } });
        reverted += 1;
      }
      try {
        const accounting = strapi.service('api::acc-journal-entry.accounting');
        if (accounting && adj.gl_posted) {
          const reversals = await accounting.reverseBySource(SOURCE_TYPE, adj.id, { posted_by: user.email || String(user.id) });
          glReversed = Array.isArray(reversals) && reversals.length > 0;
        }
      } catch (e) {
        strapi.log.warn(`[stock-adjustment] GL reversal failed (best-effort): ${e.message}`);
      }
    }

    await strapi.entityService.update(ADJ_UID, adj.id, { data: { status: 'Cancelled', gl_posted: adj.gl_posted && !glReversed } });
    strapi.log.info(`[stock-adjustment] ${adj.adjustment_number} cancelled (reverted ${reverted}, glReversed=${glReversed}) by ${user.email || user.id}`);
    return ctx.send({ success: true, status: 'Cancelled', reverted, glReversed });
  },
};
