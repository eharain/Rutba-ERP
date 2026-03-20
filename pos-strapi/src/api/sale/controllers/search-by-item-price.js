'use strict';

/**
 * search-by-item-price controller
 *
 * Accepts `min` and/or `max` query parameters and returns an array of
 * sale documentIds that contain at least one sale-item whose `price`
 * falls within the given range.
 *
 * GET /sales/search-by-item-price?min=10&max=50
 * Response: { data: ["docId1", "docId2", …] }
 *
 * Authentication is enforced manually (auth: false on the route)
 * so Strapi doesn't reject the custom action name.
 */

async function ensureUser(ctx) {
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

module.exports = {
  async searchByItemPrice(ctx) {
    const user = await ensureUser(ctx);
    if (!user) return;

    const { min, max } = ctx.query;
    const hasMin = min !== undefined && min !== '';
    const hasMax = max !== undefined && max !== '';

    if (!hasMin && !hasMax) {
      return ctx.send({ data: [] });
    }

    const priceFilter = {};
    if (hasMin) priceFilter.$gte = parseFloat(min);
    if (hasMax) priceFilter.$lte = parseFloat(max);

    const saleItems = await strapi.entityService.findMany(
      'api::sale-item.sale-item',
      {
        filters: {
          price: priceFilter,
        },
        populate: { sale: true },
        fields: ['id'],
        limit: 500,
      }
    );

    const saleDocIds = new Set();
    for (const si of saleItems) {
      const docId = si.sale?.documentId;
      if (docId) saleDocIds.add(docId);
    }

    return ctx.send({ data: Array.from(saleDocIds) });
  },
};
