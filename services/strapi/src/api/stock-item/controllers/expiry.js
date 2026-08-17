'use strict';

/**
 * Expiry actions on stock-item.
 *
 *   GET  /stock-items/expiring?days=30  — InStock units whose expiry_date falls
 *        within the horizon (soonest first). Any authenticated user.
 *   POST /stock-items/sweep-expired     — flip every InStock unit already past
 *        its expiry_date to status 'Expired' (dropping it from on-hand via the
 *        stock-item lifecycle). Admin only. Idempotent.
 *
 * Auth is enforced manually (auth:false routes) — same pattern as
 * stock-items/recompute-product-stock and transfer.
 */

const { localDateISO } = require('../../../utils/local-date');

const STOCK_ITEM_UID = 'api::stock-item.stock-item';

function today() {
  return localDateISO();
}
function horizon(days) {
  const d = new Date();
  d.setDate(d.getDate() + (Number.isFinite(Number(days)) ? Number(days) : 30));
  return localDateISO(d);
}

const { ensureUser } = require('../../../utils/ensure-user');
const { requireAppRole } = require('../../../utils/require-admin');

module.exports = {
  // GET /stock-items/expiring
  async getExpiring(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const days = ctx.query?.days;
    const rows = await strapi.entityService.findMany(STOCK_ITEM_UID, {
      filters: {
        status: 'InStock',
        $or: [{ archived: false }, { archived: { $null: true } }],
        expiry_date: { $notNull: true, $lte: horizon(days) },
      },
      fields: ['id', 'documentId', 'barcode', 'sku', 'expiry_date', 'status'],
      populate: { product: { fields: ['name', 'sku'] }, branch: { fields: ['name'] }, batch: { fields: ['batch_code'] } },
      sort: { expiry_date: 'asc' },
      limit: 500,
    });
    return ctx.send({ data: rows, horizonDate: horizon(days), today: today() });
  },

  // POST /stock-items/sweep-expired
  async sweepExpired(ctx) {
    // Scoped to inventory/stock admins — a broad "any *_admin" match would let
    // hr_admin / cms_admin etc. sweep stock.
    const user = await requireAppRole(ctx, strapi, {
      domains: ['inventory', 'stock'],
      levels: ['admin'],
      message: 'Only inventory/stock administrators can sweep expired stock',
    });
    if (!user) return;

    // Shared with the daily inventoryExpirySweep cron — sweeps serialized units
    // AND bulk batches past expiry (see api::stock-item.sweepExpired).
    const res = await strapi.service(STOCK_ITEM_UID).sweepExpired(today());
    strapi.log.info(`[stock-item] sweep-expired: ${res.items} unit(s) + ${res.batches} batch(es) past ${res.asOf} by ${user.email || user.id}`);
    return ctx.send({ success: true, expired: res.items, batchesExpired: res.batches, asOf: res.asOf });
  },
};
