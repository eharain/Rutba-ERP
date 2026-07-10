'use strict';

/**
 * POST /stock-batches/recompute-product-bulk
 *
 * Admin-triggered job that walks every product and rebuilds
 * `product.bulk_quantity_on_hand` from the live sum of remaining quantity across
 * its Active batches. The stock-batch lifecycle keeps the cache fresh during
 * normal operation — this endpoint exists for post-migration backfill,
 * post-incident reconcile, or any time the bulk cache is suspected of drifting.
 *
 * Auth is enforced manually (auth: false on the route) so Strapi doesn't reject
 * the custom action name. Mirrors stock-items/recompute-product-stock.
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
      return ctx.forbidden('Only administrators can recompute bulk stock');
    }

    const summary = await strapi
      .service('api::stock-batch.stock-batch')
      .recomputeAllProductsBulk();

    strapi.log.info(
      `[recompute-product-bulk] triggered by ${user.email || user.username || user.id} — ` +
      `processed=${summary.processed} corrected=${summary.corrected} ms=${summary.durationMs}`
    );

    return ctx.send({ success: true, ...summary });
  },
};
