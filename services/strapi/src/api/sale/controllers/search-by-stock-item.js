'use strict';

/**
 * search-by-stock-item controller
 *
 * Accepts a `term` query parameter and returns an array of sale documentIds
 * whose sale-items contain stock-items matching the term (name, sku, or barcode).
 *
 * GET /sales/search-by-stock-item?term=xyz
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
  async searchByStockItem(ctx) {
    const user = await ensureUser(ctx);
    if (!user) return;

    const { term } = ctx.query;
    if (!term || !term.trim()) {
      return ctx.send({ data: [] });
    }

    const trimmed = term.trim();

    // Step 1 — find stock-item IDs whose name / sku / barcode match
    const stockItems = await strapi.entityService.findMany(
      'api::stock-item.stock-item',
      {
        filters: {
          $or: [
            { name: { $containsi: trimmed } },
            { sku: { $containsi: trimmed } },
            { barcode: { $containsi: trimmed } },
          ],
        },
        fields: ['id'],
        limit: 300,
      }
    );

    if (!stockItems.length) {
      return ctx.send({ data: [] });
    }

    const stockIds = stockItems.map((s) => s.id);

    // Step 2 — find sale-items linked to those stock-items, populate the sale
    const saleItems = await strapi.entityService.findMany(
      'api::sale-item.sale-item',
      {
        filters: {
          items: { id: { $in: stockIds } },
        },
        populate: { sale: true },
        fields: ['id'],
        limit: 500,
      }
    );

    // Step 3 — collect unique sale documentIds
    const saleDocIds = new Set();
    for (const si of saleItems) {
      const docId = si.sale?.documentId;
      if (docId) saleDocIds.add(docId);
    }

    return ctx.send({ data: Array.from(saleDocIds) });
  },
};
