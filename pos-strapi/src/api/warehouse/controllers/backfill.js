'use strict';

/**
 * POST /warehouses/backfill-default-locations
 *
 * Admin-triggered one-time job that gives every branch a default warehouse +
 * receiving location, places every unplaced stock-item into its branch's
 * defaults, then rebuilds the stock-level cache. Idempotent — safe to re-run;
 * it only touches stock-items that lack a warehouse.
 *
 * This is the Foundation backfill (Epic 2 Phase 1). It runs on demand rather
 * than at boot so a large catalog isn't migrated during startup, and so it can
 * be re-triggered after suspected drift. Auth is enforced manually (auth: false
 * on the route) so Strapi doesn't reject the custom action name — same pattern
 * as stock-items/recompute-product-stock and stock-items/transfer.
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
      return ctx.forbidden('Only administrators can backfill default locations');
    }

    const summary = await strapi
      .service('api::stock-item.stock-item')
      .backfillDefaultLocations();

    strapi.log.info(
      `[warehouses/backfill-default-locations] triggered by ${user.email || user.username || user.id} — ` +
      `warehousesCreated=${summary.warehousesCreated} locationsCreated=${summary.locationsCreated} ` +
      `itemsPlaced=${summary.itemsPlaced} ms=${summary.durationMs}`
    );

    return ctx.send({ success: true, ...summary });
  },
};
