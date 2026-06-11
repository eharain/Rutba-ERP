'use strict';

/**
 * POST /mfg-bundles/:documentId/process
 *
 * Drive a bundle through its state machine. On Completed the state-machine
 * service rolls the bundle's finished/rejected garment counts up to the work
 * order (the single source of WO yield).
 *
 * Auth: manual (route is auth:false). Any authenticated user may move a bundle.
 */

const { ensureUser } = require('../../../utils/mfg-auth');
const stateMachine = require('../services/mfg-bundle-state-machine');

module.exports = {
  async process(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const { documentId } = ctx.params;
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const { status, ...extra } = body;

    if (!documentId) return ctx.badRequest('documentId is required');
    if (!status) return ctx.badRequest('status is required');

    try {
      const updated = await stateMachine.executeTransition(documentId, status, extra);
      return ctx.send({ success: true, data: updated });
    } catch (err) {
      strapi.log.warn(`[mfg-bundle/process] ${documentId} → ${status} failed: ${err.message}`);
      return ctx.throw(err.status || 500, err.message);
    }
  },
};
