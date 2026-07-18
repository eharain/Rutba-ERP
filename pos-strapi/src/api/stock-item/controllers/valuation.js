'use strict';

/**
 * GET /stock-items/valuation?branch=<documentId>
 *
 * Inventory valuation report (Epic 2) — specific-identification on-hand value:
 * serialized (Σ InStock cost_price) + bulk (Σ Active batch remaining × unit_cost),
 * broken down by branch. Financial data → admin/manager only. Auth enforced
 * manually (auth:false route).
 */

const STOCK_ITEM_UID = 'api::stock-item.stock-item';

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

// Super-admin OR an inventory/stock/accounts admin|manager app-role.
async function canViewValuation(userId, strapi) {
  const user = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: userId },
    populate: { role: { select: ['type'] }, app_roles: { select: ['key'] } },
  });
  if (user?.role?.type === 'admin') return true;
  const keys = (user?.app_roles || []).map((r) => r?.key).filter(Boolean);
  return keys.some((k) => /^(inventory|stock|accounts)_(admin|manager)$/.test(String(k)));
}

module.exports = {
  async run(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;
    if (!(await canViewValuation(user.id, strapi))) {
      return ctx.forbidden('Inventory / accounts manager access is required');
    }

    const branchDocId = ctx.query?.branch || null;
    const report = await strapi
      .service(STOCK_ITEM_UID)
      .computeInventoryValuation({ branchDocId });

    return ctx.send({ success: true, ...report });
  },
};
