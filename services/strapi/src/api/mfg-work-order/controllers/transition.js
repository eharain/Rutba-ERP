'use strict';

/**
 * POST /mfg-work-orders/:documentId/process
 *
 * Drive a work order through its state machine (Released / InProgress / OnHold /
 * Completed / Cancelled). The state-machine service owns all side effects —
 * costing roll-up and finished stock-item creation on Completed.
 *
 * Auth: manual (route is auth:false). Any authenticated user may move a WO,
 * but a workflow transition carrying `approles` is gated to those role levels
 * (enforced in the state machine via the caller's resolved app-role levels).
 */

const { ensureUser } = require('../../../utils/mfg-auth');
const { roleLevelsFor } = require('../../../utils/app-roles');
const stateMachine = require('../services/mfg-work-order-state-machine');

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
      const actorRoleLevels = await roleLevelsFor(user.id, strapi);
      const updated = await stateMachine.executeTransition(documentId, status, extra, { actorRoleLevels, actor: user });
      return ctx.send({ success: true, data: updated });
    } catch (err) {
      strapi.log.warn(`[mfg-work-order/process] ${documentId} → ${status} failed: ${err.message}`);
      return ctx.throw(err.status || 500, err.message);
    }
  },
};
