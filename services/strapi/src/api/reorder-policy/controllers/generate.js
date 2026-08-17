'use strict';

/**
 * POST /reorder-policies/generate-purchases
 * POST /reorder-policies/generate-work-orders
 *
 * Turn reviewed (or freshly-computed) reorder suggestions into draft purchases
 * grouped by supplier, or into draft work-orders against each product's default
 * BOM (Epic 4 P3). Manager/admin only — these commit spend and shop-floor time.
 *
 * Routes are auth:false so Strapi doesn't reject the custom action names, which
 * also skips the api-pro interceptor; the gate below is the only authorization
 * these endpoints get.
 *
 * Body: { branch?: docId, suggestions?: [{ product, suggested_qty, unit_cost, preferred_supplier }] }
 */

const POLICY_UID = 'api::reorder-policy.reorder-policy';

const { requireAppRole } = require('../../../utils/require-admin');

// Purchasing is the inventory/stock supervisors' call; work-orders add
// manufacturing, which the generateWorkOrders descriptor declares. The regex
// these replaced also listed `purchase_*`, a role prefix no domain defines —
// it never matched anything.
const PURCHASE_DOMAINS = ['inventory', 'stock'];
const WORK_ORDER_DOMAINS = ['inventory', 'stock', 'manufacturing'];
const LEVELS = ['admin', 'manager'];

module.exports = {
  async generatePurchases(ctx) {
    const user = await requireAppRole(ctx, strapi, {
      domains: PURCHASE_DOMAINS,
      levels: LEVELS,
      message: 'Inventory / purchasing manager access is required',
    });
    if (!user) return;

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const res = await strapi.service(POLICY_UID).generatePurchases({
      branchDocId: body.branch || body.branchDocId || null,
      suggestions: Array.isArray(body.suggestions) ? body.suggestions : null,
      actorId: user.id,
    });
    return ctx.send({ success: true, ...res });
  },

  async generateWorkOrders(ctx) {
    const user = await requireAppRole(ctx, strapi, {
      domains: WORK_ORDER_DOMAINS,
      levels: LEVELS,
      message: 'Inventory / manufacturing manager access is required',
    });
    if (!user) return;

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const res = await strapi.service(POLICY_UID).generateWorkOrders({
      branchDocId: body.branch || body.branchDocId || null,
      suggestions: Array.isArray(body.suggestions) ? body.suggestions : null,
      actorId: user.id,
    });
    return ctx.send({ success: true, ...res });
  },
};
