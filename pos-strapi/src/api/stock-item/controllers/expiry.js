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

const STOCK_ITEM_UID = 'api::stock-item.stock-item';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function horizon(days) {
  const d = new Date();
  d.setDate(d.getDate() + (Number.isFinite(Number(days)) ? Number(days) : 30));
  return d.toISOString().slice(0, 10);
}

async function ensureUser(ctx, strapi) {
  if (ctx.state?.user) return ctx.state.user;
  try {
    const token = await strapi.plugin('users-permissions').service('jwt').getToken(ctx);
    if (token?.id) {
      const user = await strapi.plugin('users-permissions').service('user').fetchAuthenticatedUser(token.id);
      if (user && !user.blocked) { ctx.state.user = user; return user; }
    }
  } catch (_) { /* invalid / missing token */ }
  ctx.unauthorized('Authentication required');
  return null;
}

async function isAdminUser(userId, strapi) {
  const user = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: userId },
    populate: { role: { select: ['type'] }, app_roles: { select: ['key'] } },
  });
  if (user?.role?.type === 'admin') return true;
  const keys = (user?.app_roles || []).map((r) => r?.key).filter(Boolean);
  return keys.some((k) => /(?:^|_)admin$/.test(String(k)));
}

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
      populate: { product: { fields: ['name', 'sku'] }, warehouse: { fields: ['name'] }, batch: { fields: ['batch_code'] } },
      sort: { expiry_date: 'asc' },
      limit: 500,
    });
    return ctx.send({ data: rows, horizonDate: horizon(days), today: today() });
  },

  // POST /stock-items/sweep-expired
  async sweepExpired(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;
    const admin = await isAdminUser(user.id, strapi);
    if (!admin) return ctx.forbidden('Only administrators can sweep expired stock');

    const t = today();
    const units = await strapi.db.query(STOCK_ITEM_UID).findMany({
      where: {
        status: 'InStock',
        $or: [{ archived: false }, { archived: { $null: true } }],
        expiry_date: { $lt: t },
      },
      select: ['id'],
      limit: 100000,
    });

    let expired = 0;
    for (const u of units) {
      try {
        await strapi.entityService.update(STOCK_ITEM_UID, u.id, { data: { status: 'Expired' } });
        expired += 1;
      } catch (err) {
        strapi.log.warn(`[stock-item] sweepExpired unit=${u.id} failed: ${err.message}`);
      }
    }

    strapi.log.info(`[stock-item] sweep-expired flipped ${expired} unit(s) past ${t} by ${user.email || user.id}`);
    return ctx.send({ success: true, expired, asOf: t });
  },
};
