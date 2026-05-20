'use strict';

/**
 * POST /stock-items/recompute-product-stock
 *
 * Admin-triggered job that walks every product and rebuilds
 * `product.stock_quantity` from the live count of InStock stock-items.
 * The stock-item lifecycle keeps the cache fresh during normal operation —
 * this endpoint exists for post-migration backfill, post-incident reconcile,
 * or any time the cache is suspected of drifting.
 *
 * Auth is enforced manually (auth: false on the route) so Strapi doesn't
 * reject the custom action name. Mirrors the pattern used by sales/cancel.
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

  // Strapi super-admin always passes.
  if (user?.role?.type === 'admin') return true;

  // api-pro role naming convention: `{domain}_admin` / `{domain}_manager` /
  // `{domain}_staff` — admin level is encoded as the `_admin` suffix on the
  // role key (mirror of pos-shared/lib/roles.js#isActiveAdminRole). The
  // api-provider descriptor already gates by apps:['stock','cms'] +
  // approle:['admin'], so by the time we reach this controller api-pro has
  // already confirmed the user holds an admin role in one of those apps.
  const appRoleKeys = (user?.app_roles || []).map((r) => r?.key).filter(Boolean);
  return appRoleKeys.some((k) => /(?:^|_)admin$/.test(String(k)));
}

module.exports = {
  async run(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const admin = await isAdminUser(user.id, strapi);
    if (!admin) {
      return ctx.forbidden('Only administrators can recompute product stock');
    }

    const summary = await strapi
      .service('api::stock-item.stock-item')
      .recomputeAllProducts();

    strapi.log.info(
      `[recompute-product-stock] triggered by ${user.email || user.username || user.id} — ` +
      `processed=${summary.processed} corrected=${summary.corrected} ms=${summary.durationMs}`
    );

    return ctx.send({ success: true, ...summary });
  },
};
