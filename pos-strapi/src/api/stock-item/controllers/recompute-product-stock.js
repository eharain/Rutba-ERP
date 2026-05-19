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
      permission_roles: {
        select: ['level'],
        populate: { domain: { select: ['key'] } },
      },
    },
  });

  if (user?.role?.type === 'admin') return true;

  const adminKeys = (user?.permission_roles || [])
    .filter((r) => r?.level === 'admin')
    .map((r) => r?.domain?.key)
    .filter(Boolean);
  // Either a product or stock-item domain admin can trigger the job — it
  // mutates the product table but the work belongs to stock ownership.
  return adminKeys.includes('product') || adminKeys.includes('stock-item');
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
