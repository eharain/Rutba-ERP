'use strict';

/**
 * POST /stock-items/transfer
 *
 * Bulk-move N stock-items to a destination branch. Each item gets:
 *   - branch       = toBranch
 *   - status       = 'InStock'   (transferred items are immediately sellable
 *                                  at the destination)
 *
 * Records a `Transferred` entry in each item's status_history with the source
 * branch info so the move shows up on the audit trail — the regular lifecycle
 * history hook keys off `status` changes and a pure branch change wouldn't be
 * captured otherwise.
 *
 * The api-provider already exports a `StockItemsEndpoints.transfer()`
 * descriptor for this path; both the global /stock-items page and the
 * per-product Assign tab call it (replacing the previous N-call update loop).
 *
 * `auth: false` on the route skips BOTH the users-permissions scope check and
 * the api-pro interceptor, so nothing above the controller authorizes this
 * call — a bare authentication check would hand a bulk cross-branch stock move
 * to any valid JWT, storefront customers included. Gate it at the level the
 * StockItemsEndpoints.transfer descriptor declares: inventory/stock
 * manager-or-admin. (Staff scan and sell stock; relocating a hundred units
 * between branches with no transfer document behind it is a supervisor's call.)
 */

const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const BRANCH_UID = 'api::branch.branch';

const { requireAppRole } = require('../../../utils/require-admin');

// Resolve a branch reference (documentId or numeric id) to the numeric DB id.
async function resolveBranchId(ref) {
  if (ref == null || ref === '') return null;
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
    const row = await strapi.db.query(BRANCH_UID).findOne({
      where: { id: Number(ref) },
      select: ['id', 'name'],
    });
    return row ? { id: row.id, name: row.name } : null;
  }
  const row = await strapi.db.query(BRANCH_UID).findOne({
    where: { documentId: String(ref) },
    select: ['id', 'name'],
  });
  return row ? { id: row.id, name: row.name } : null;
}

// Resolve a stock-item reference (documentId or numeric id) to a loaded row
// so we can capture old branch info for the audit trail before mutating.
async function resolveStockItem(ref) {
  if (ref == null || ref === '') return null;
  const where = (typeof ref === 'number' || /^\d+$/.test(String(ref)))
    ? { id: Number(ref) }
    : { documentId: String(ref) };
  return strapi.db.query(STOCK_ITEM_UID).findOne({
    where,
    select: ['id', 'documentId', 'status', 'cost_price', 'selling_price'],
    populate: {
      branch: { select: ['id', 'name'] },
      status_history: true,
    },
  });
}

module.exports = {
  async run(ctx) {
    const user = await requireAppRole(ctx, strapi, {
      domains: ['inventory', 'stock'],
      levels: ['admin', 'manager'],
      message: 'Only inventory/stock managers can transfer stock between branches',
    });
    if (!user) return;

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const { items, toBranch, reason } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return ctx.badRequest('items must be a non-empty array of stock-item ids/documentIds');
    }
    if (!toBranch) {
      return ctx.badRequest('toBranch is required');
    }

    const destination = await resolveBranchId(toBranch);
    if (!destination) {
      return ctx.badRequest(`Destination branch not found: ${toBranch}`);
    }

    const transferred = [];
    const failed = [];
    const fromBranches = new Map(); // branchId → count

    for (const ref of items) {
      try {
        const item = await resolveStockItem(ref);
        if (!item) {
          failed.push({ ref, message: 'stock-item not found' });
          continue;
        }

        const oldBranch = item.branch || null;
        if (oldBranch?.id) {
          fromBranches.set(oldBranch.id, (fromBranches.get(oldBranch.id) || 0) + 1);
        }

        // Append a Transferred entry so the move shows up on the timeline.
        // The lifecycle history hook only fires when status actually changes,
        // so we hand-roll the entry here for branch-only moves.
        const history = Array.isArray(item.status_history)
          ? item.status_history.map(({ id, ...rest }) => rest)
          : [];

        history.push({
          status: 'Transferred',
          cost_price: item.cost_price ?? null,
          selling_price: item.selling_price ?? null,
          createdAt: new Date().toISOString().split('T')[0],
        });

        await strapi.entityService.update(STOCK_ITEM_UID, item.id, {
          data: {
            branch: destination.id,
            status: 'InStock',
            status_history: history,
          },
        });

        transferred.push({
          id: item.id,
          documentId: item.documentId,
          from: oldBranch ? { id: oldBranch.id, name: oldBranch.name } : null,
        });
      } catch (err) {
        failed.push({ ref, message: err.message });
        strapi.log.warn(`[stock-items/transfer] ref=${ref} failed: ${err.message}`);
      }
    }

    const fromBranchSummary = {};
    for (const [bid, count] of fromBranches.entries()) {
      fromBranchSummary[bid] = count;
    }

    strapi.log.info(
      `[stock-items/transfer] ${user.email || user.username || user.id} moved ${transferred.length}/${items.length} item(s) to branch=${destination.name} (id=${destination.id})${reason ? ` reason="${reason}"` : ''}`
    );

    return ctx.send({
      success: true,
      transferred: transferred.length,
      failed,
      to: { id: destination.id, name: destination.name },
      fromBranches: fromBranchSummary,
      items: transferred,
    });
  },
};
