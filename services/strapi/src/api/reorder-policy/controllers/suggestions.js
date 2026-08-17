'use strict';

/**
 * GET /reorder-policies/suggestions?branch=<documentId>
 *
 * Compute-on-read replenishment suggestions (Epic 4). The route is auth:false
 * so Strapi doesn't reject the custom action name — which also means neither
 * the users-permissions scope check nor the api-pro interceptor runs, and a
 * bare authentication check would expose supplier costs and per-product
 * deficits to any valid JWT (a storefront customer's included). Any inventory
 * or stock member passes: reading the replenishment list is the stock clerk's
 * daily job, and the descriptor declares admin/manager/staff. Acting on it
 * (generate-purchases / generate-work-orders) is manager+ — see generate.js.
 */

const { requireAppRole } = require('../../../utils/require-admin');

module.exports = {
  async getReorderSuggestions(ctx) {
    const user = await requireAppRole(ctx, strapi, {
      domains: ['inventory', 'stock'],
      message: 'An inventory or stock app role is required to view reorder suggestions',
    });
    if (!user) return;

    const branchDocId = ctx.query?.branch || null;
    const rows = await strapi
      .service('api::reorder-policy.reorder-policy')
      .getReorderSuggestions({ branchDocId });

    return ctx.send({ data: rows, count: rows.length });
  },
};
