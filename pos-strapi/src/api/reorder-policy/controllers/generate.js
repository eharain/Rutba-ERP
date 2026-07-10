'use strict';

/**
 * POST /reorder-policies/generate-purchases
 *
 * Turn reviewed (or freshly-computed) Purchase-source reorder suggestions into
 * draft purchases grouped by supplier (Epic 4 P3). Manager/admin only. Route is
 * auth:false so Strapi doesn't reject the custom action name — auth + role gate
 * are enforced here.
 *
 * Body: { warehouse?: docId, suggestions?: [{ product, suggested_qty, unit_cost, preferred_supplier }] }
 */

const POLICY_UID = 'api::reorder-policy.reorder-policy';

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

// Super-admin OR an inventory/stock/purchase admin|manager app-role.
async function isReplenishManager(userId, strapi) {
  const user = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: userId },
    populate: { role: { select: ['type'] }, app_roles: { select: ['key'] } },
  });
  if (user?.role?.type === 'admin') return true;
  const keys = (user?.app_roles || []).map((r) => r?.key).filter(Boolean);
  return keys.some((k) => /^(inventory|stock|purchase)_(admin|manager)$/.test(String(k)));
}

module.exports = {
  async generatePurchases(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;
    if (!(await isReplenishManager(user.id, strapi))) {
      return ctx.forbidden('Inventory / purchasing manager access is required');
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const res = await strapi.service(POLICY_UID).generatePurchases({
      warehouseDocId: body.warehouse || body.warehouseDocId || null,
      suggestions: Array.isArray(body.suggestions) ? body.suggestions : null,
      actorId: user.id,
    });
    return ctx.send({ success: true, ...res });
  },

  async generateWorkOrders(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;
    if (!(await isReplenishManager(user.id, strapi))) {
      return ctx.forbidden('Inventory / manufacturing manager access is required');
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const res = await strapi.service(POLICY_UID).generateWorkOrders({
      warehouseDocId: body.warehouse || body.warehouseDocId || null,
      suggestions: Array.isArray(body.suggestions) ? body.suggestions : null,
      actorId: user.id,
    });
    return ctx.send({ success: true, ...res });
  },
};
