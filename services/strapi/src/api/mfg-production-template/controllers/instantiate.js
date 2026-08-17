'use strict';

/**
 * POST /mfg-production-templates/:documentId/instantiate
 *
 * Resolve a production template's category/kind input & output slots to concrete
 * products and emit a versioned mfg-bom (Draft by default; `activate:true` creates
 * it Active, which runs the hard kind-typing check). The WO still runs off the
 * concrete BOM — the template is a convenience/consistency layer above it.
 *
 * Auth: manual (route is auth:false), mirroring the WO transition controller.
 * Minting BOMs shapes production costing, so it requires a manufacturing
 * manager/admin app-role — not just any authenticated user.
 *
 * Body:
 *   outputProduct   (required) documentId of the primary output product
 *   inputMap        { <slot>: productDocumentId } — slot = input_line.role_label || `input_<i>` (or "<i>")
 *   outputMap       { <slot>: productDocumentId } — non-primary output slots
 *   name, version, production_line, activate
 */

const { requireAppRole } = require('../../../utils/require-admin');

module.exports = {
  async instantiate(ctx) {
    const user = await requireAppRole(ctx, strapi, {
      domains: ['manufacturing'],
      levels: ['admin', 'manager'],
    });
    if (!user) return;

    const { documentId } = ctx.params;
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};

    if (!documentId) return ctx.badRequest('documentId is required');
    if (!body.outputProduct) return ctx.badRequest('outputProduct is required');

    try {
      const bom = await strapi
        .service('api::mfg-production-template.mfg-production-template')
        .instantiateBom(documentId, body, user);
      return ctx.send({ success: true, data: bom });
    } catch (err) {
      strapi.log.warn(`[mfg-production-template/instantiate] ${documentId} failed: ${err.message}`);
      return ctx.throw(err.status || 500, err.message);
    }
  },
};
