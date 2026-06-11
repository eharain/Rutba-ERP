'use strict';

/**
 * Shared auth helpers for manufacturing custom-action controllers.
 *
 * Manufacturing transition endpoints are registered with `auth: false` so Strapi
 * doesn't reject the custom action names — which means the api-pro interceptor
 * (it skips unauthenticated requests) does NOT gate them. Auth is therefore
 * enforced here, mirroring stock-item/transfer.js and recompute-product-stock.js:
 *   - ensureUser            → any authenticated user (manual JWT parse)
 *   - isManufacturingManager → super-admin OR a manufacturing manager/admin role,
 *                              for payroll-gating actions (task approve/reject) and
 *                              reconciliation jobs (lot recompute).
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

/**
 * True when the user is a Strapi super-admin or holds a manufacturing admin /
 * manager app-role. Used to gate payroll-affecting and reconciliation actions.
 */
async function isManufacturingManager(userId, strapi) {
  const user = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: userId },
    populate: {
      role: { select: ['type'] },
      app_roles: { select: ['key'] },
    },
  });
  if (user?.role?.type === 'admin') return true;
  const keys = (user?.app_roles || []).map((r) => r?.key).filter(Boolean);
  return keys.some((k) => k === 'manufacturing_admin' || k === 'manufacturing_manager');
}

module.exports = { ensureUser, isManufacturingManager };
