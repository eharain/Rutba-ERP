'use strict';

// Template studio endpoints. Handler names must start with a prefix the api-pro
// seeder whitelists — `preview` and `test` do not, which is why these are
// `getPreview` / `sendTest` / `duplicateTemplate`.

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');

const UID = 'api::cmp-template.cmp-template';

const gate = (ctx, strapi, levels) => requireAppRole(ctx, strapi, { domains: ['campaigns'], levels });

function fail(ctx, e) {
  const status = e?.status || 502;
  return ctx.send({ error: e?.code || 'error', message: e?.message || 'Request failed.' }, status);
}

module.exports = createCoreController(UID, ({ strapi }) => ({

  /**
   * POST /cmp-templates/:documentId/preview
   * Body: { data?, utm? } — sample merge values.
   * Returns the rendered subject/html/text plus which keys were left empty.
   */
  async getPreview(ctx) {
    if (!(await gate(ctx, strapi, ['admin', 'manager', 'staff']))) return;
    const { data, utm } = ctx.request.body || {};
    try {
      return ctx.send(await strapi.service(UID).preview(ctx.params.documentId, { data, utm }));
    } catch (e) {
      return fail(ctx, e);
    }
  },

  /**
   * POST /cmp-templates/:documentId/test-send
   * Body: { to, data?, identityDocId? }
   * One rendered copy to a real inbox, sent transactional so it bypasses
   * marketing pacing and stays out of the marketing reputation stats.
   */
  async sendTest(ctx) {
    if (!(await gate(ctx, strapi, ['admin', 'manager', 'staff']))) return;
    const { to, data, identityDocId } = ctx.request.body || {};
    try {
      return ctx.send(await strapi.service(UID).sendTest(ctx.params.documentId, { to, data, identityDocId }));
    } catch (e) {
      return fail(ctx, e);
    }
  },

  /** POST /cmp-templates/:documentId/duplicate — branch a working design. */
  async duplicateTemplate(ctx) {
    if (!(await gate(ctx, strapi, ['admin', 'manager', 'staff']))) return;
    try {
      const created = await strapi.service(UID).duplicate(ctx.params.documentId);
      return ctx.send({ ok: true, template: created });
    } catch (e) {
      return fail(ctx, e);
    }
  },
}));
