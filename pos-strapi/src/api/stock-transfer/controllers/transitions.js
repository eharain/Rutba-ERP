'use strict';

/**
 * Stock-transfer state transitions — dispatch / receive / cancel.
 *
 * Serialized model: a transfer holds a set of stock-items. On dispatch each unit
 * goes InStock -> Transferred (in-transit; not counted in any warehouse on-hand).
 * On receive each in-transit unit goes Transferred -> InStock at the destination
 * warehouse (+ optional destination bin). On cancel, in-transit units revert to
 * InStock (they stay at the origin). Every unit mutation is a documents/entity
 * update so the stock-item lifecycle recomputes product.stock_quantity + the
 * per-warehouse stock-level cache.
 *
 * Auth is manual (auth:false on the routes) so Strapi doesn't reject the custom
 * action names — same pattern as stock-items/transfer. Transitions require an
 * inventory/stock app-role (any level — warehouse staff dispatch and receive);
 * unrelated authenticated users (e.g. storefront customers) are rejected.
 */

const { requireAppRole } = require('../../../utils/require-admin');

const STOCK_TRANSFER_UID = 'api::stock-transfer.stock-transfer';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';

const requireTransferMember = (ctx, strapi) => requireAppRole(ctx, strapi, {
  domains: ['inventory', 'stock'],
});

async function loadTransfer(strapi, ref) {
  if (ref == null || ref === '') return null;
  const where = (typeof ref === 'number' || /^\d+$/.test(String(ref)))
    ? { id: Number(ref) }
    : { documentId: String(ref) };
  return strapi.db.query(STOCK_TRANSFER_UID).findOne({
    where,
    select: ['id', 'documentId', 'status', 'transfer_number'],
    populate: {
      from_warehouse: { select: ['id', 'documentId', 'name'] },
      to_warehouse: { select: ['id', 'documentId', 'name'] },
      to_location: { select: ['id', 'documentId'] },
      stock_items: { select: ['id', 'documentId', 'status'] },
    },
  });
}

module.exports = {
  // POST /stock-transfers/:id/dispatch
  async dispatch(ctx) {
    const user = await requireTransferMember(ctx, strapi);
    if (!user) return;

    const t = await loadTransfer(strapi, ctx.params.id);
    if (!t) return ctx.notFound('Transfer not found');
    if (t.status !== 'Draft') return ctx.badRequest(`Cannot dispatch a transfer in status ${t.status}`);

    const units = t.stock_items || [];
    if (units.length === 0) return ctx.badRequest('Transfer has no units to dispatch');

    let dispatched = 0;
    const skipped = [];
    for (const u of units) {
      if (u.status !== 'InStock') { skipped.push({ documentId: u.documentId, status: u.status }); continue; }
      await strapi.entityService.update(STOCK_ITEM_UID, u.id, { data: { status: 'Transferred' } });
      dispatched += 1;
    }

    await strapi.entityService.update(STOCK_TRANSFER_UID, t.id, {
      data: { status: 'InTransit', dispatched_at: new Date().toISOString() },
    });

    strapi.log.info(`[stock-transfer] ${t.transfer_number} dispatched ${dispatched}/${units.length} by ${user.email || user.id}`);
    return ctx.send({ success: true, status: 'InTransit', dispatched, skipped });
  },

  // POST /stock-transfers/:id/receive
  async receive(ctx) {
    const user = await requireTransferMember(ctx, strapi);
    if (!user) return;

    const t = await loadTransfer(strapi, ctx.params.id);
    if (!t) return ctx.notFound('Transfer not found');
    if (!['InTransit', 'PartiallyReceived'].includes(t.status)) {
      return ctx.badRequest(`Cannot receive a transfer in status ${t.status}`);
    }
    if (!t.to_warehouse?.id) return ctx.badRequest('Transfer has no destination warehouse');

    let received = 0;
    for (const u of (t.stock_items || [])) {
      if (u.status !== 'Transferred') continue; // only in-transit units
      const data = { status: 'InStock', warehouse: t.to_warehouse.id };
      if (t.to_location?.id) data.storage_location = t.to_location.id;
      await strapi.entityService.update(STOCK_ITEM_UID, u.id, { data });
      received += 1;
    }

    // Recompute the transfer status from the fresh unit states.
    const fresh = await loadTransfer(strapi, t.id);
    const stillInTransit = (fresh.stock_items || []).some((u) => u.status === 'Transferred');
    const status = stillInTransit ? 'PartiallyReceived' : 'Received';
    const patch = { status };
    if (status === 'Received') patch.received_at = new Date().toISOString();
    await strapi.entityService.update(STOCK_TRANSFER_UID, t.id, { data: patch });

    strapi.log.info(`[stock-transfer] ${t.transfer_number} received ${received} -> ${status} by ${user.email || user.id}`);
    return ctx.send({ success: true, status, received });
  },

  // POST /stock-transfers/:id/cancel
  async cancel(ctx) {
    const user = await requireTransferMember(ctx, strapi);
    if (!user) return;

    const t = await loadTransfer(strapi, ctx.params.id);
    if (!t) return ctx.notFound('Transfer not found');
    if (!['Draft', 'InTransit'].includes(t.status)) {
      return ctx.badRequest(`Cannot cancel a transfer in status ${t.status}`);
    }

    let reverted = 0;
    if (t.status === 'InTransit') {
      for (const u of (t.stock_items || [])) {
        if (u.status !== 'Transferred') continue;
        await strapi.entityService.update(STOCK_ITEM_UID, u.id, { data: { status: 'InStock' } });
        reverted += 1;
      }
    }

    await strapi.entityService.update(STOCK_TRANSFER_UID, t.id, { data: { status: 'Cancelled' } });
    strapi.log.info(`[stock-transfer] ${t.transfer_number} cancelled (reverted ${reverted}) by ${user.email || user.id}`);
    return ctx.send({ success: true, status: 'Cancelled', reverted });
  },
};
