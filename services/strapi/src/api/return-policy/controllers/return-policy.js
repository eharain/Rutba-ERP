'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const UID = 'api::return-policy.return-policy';

function appSlugFrom(ctx) {
  const q = ctx.query || {};
  return q.app || q.app_slug || ctx.request?.header?.['x-rutba-app'] || null;
}

module.exports = createCoreController(UID, ({ strapi }) => ({
  /**
   * GET /return-policy → the requesting app's policy, else the default.
   *
   * The return policy was a singleType; it is a collection now (one row per
   * app). This singular path stays as the RESOLVER so the storefront's
   * request-return form, and the descriptor that feeds it, keep working
   * unchanged. Per-row CRUD lives on /return-policies.
   *
   * Returns the *effective* policy — the row coalesced with safe defaults — so
   * a caller never has to handle "no row seeded yet".
   */
  async findEffective(ctx) {
    const policy = await strapi.service(UID).getEffective(appSlugFrom(ctx));
    return ctx.send({ data: policy });
  },
}));
