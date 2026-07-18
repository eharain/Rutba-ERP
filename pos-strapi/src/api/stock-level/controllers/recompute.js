'use strict';

/**
 * POST /stock-levels/recompute
 *
 * Admin-triggered job that rebuilds the per-(product, branch) stock-level
 * cache from the live stock-item rows. Idempotent — run after the location
 * backfill, after suspected drift, or as an ad-hoc reconcile. The stock-item
 * lifecycle keeps stock-levels fresh during normal operation; this is the
 * full-DB rebuild (the stock-level twin of stock-items/recompute-product-stock).
 *
 * Auth enforced manually (auth: false on the route) so Strapi doesn't reject
 * the custom action name — same pattern as recompute-product-stock.
 */

async function ensureUser(ctx, strapi) {
  if (ctx.state?.user) return ctx.state.user;
  try {
    const token = await strapi
      .plugin('users-permissions')
      .service('jwt')
      .getToken(ctx);
    if (token?.id) {
      const user = await strapi
        .plugin('users-permissions')
        .service('user')
        .fetchAuthenticatedUser(token.id);
      if (user && !user.blocked) {
        ctx.state.user = user;
        return user;
      }
    }
  } catch (_) { /* invalid / missing token */ }
  ctx.unauthorized('Authentication required');
  return null;
}

async function isAdminUser(userId, strapi) {
  const user = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: userId },
    populate: {
      role: { select: ['type'] },
      app_roles: { select: ['key'] },
    },
  });
  if (user?.role?.type === 'admin') return true;
  const appRoleKeys = (user?.app_roles || []).map((r) => r?.key).filter(Boolean);
  return appRoleKeys.some((k) => /(?:^|_)admin$/.test(String(k)));
}

module.exports = {
  async run(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const admin = await isAdminUser(user.id, strapi);
    if (!admin) {
      return ctx.forbidden('Only administrators can recompute stock levels');
    }

    const summary = await strapi
      .service('api::stock-item.stock-item')
      .recomputeAllStockLevels();

    strapi.log.info(
      `[stock-levels/recompute] triggered by ${user.email || user.username || user.id} — ` +
      `processed=${summary.processed} levelsWritten=${summary.levelsWritten} ms=${summary.durationMs}`
    );

    return ctx.send({ success: true, ...summary });
  },
};
