'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');

const UID = 'api::cmp-campaign.cmp-campaign';

const gate = (ctx, strapi, levels) => requireAppRole(ctx, strapi, { domains: ['campaigns'], levels });

function fail(ctx, e) {
  const status = e?.status || 502;
  return ctx.send({ error: e?.code || 'error', message: e?.message || 'Request failed.' }, status);
}

module.exports = createCoreController(UID, ({ strapi }) => ({

  /** POST /cmp-campaigns/:documentId/run — execute a run immediately. */
  async runCampaign(ctx) {
    const user = await gate(ctx, strapi, ['admin', 'manager']);
    if (!user) return;
    try {
      return ctx.send(await strapi.service(UID).startRun(ctx.params.documentId, { user }));
    } catch (e) {
      return fail(ctx, e);
    }
  },

  /** POST /cmp-campaigns/:documentId/cancel — stop all future runs. */
  async cancelCampaign(ctx) {
    const user = await gate(ctx, strapi, ['admin', 'manager']);
    if (!user) return;
    try {
      return ctx.send(await strapi.service(UID).cancel(ctx.params.documentId));
    } catch (e) {
      return fail(ctx, e);
    }
  },
}));
