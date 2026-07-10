'use strict';

/**
 * GET /reorder-policies/suggestions?warehouse=<documentId>
 *
 * Compute-on-read replenishment suggestions (Epic 4). Any authenticated user
 * (inventory staff); auth enforced manually since the route is auth:false so
 * Strapi doesn't reject the custom action name.
 */

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

module.exports = {
  async getReorderSuggestions(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const warehouseDocId = ctx.query?.warehouse || null;
    const rows = await strapi
      .service('api::reorder-policy.reorder-policy')
      .getReorderSuggestions({ warehouseDocId });

    return ctx.send({ data: rows, count: rows.length });
  },
};
