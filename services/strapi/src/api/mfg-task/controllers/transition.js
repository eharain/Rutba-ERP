'use strict';

/**
 * Task transition endpoints.
 *
 *   POST /mfg-tasks/:documentId/process  → start / complete / rework / cancel
 *                                          (any authenticated user — floor staff).
 *   POST /mfg-tasks/:documentId/approve  → approve (manager/admin only) — makes the
 *                                          task's snapshotted amount payroll-eligible.
 *   POST /mfg-tasks/:documentId/reject   → reject (manager/admin only) — zeroes the
 *                                          amount, records quantity_rejected.
 *
 * Approve/reject gate payroll, so they require a manufacturing manager/admin.
 * Auth is manual (routes are auth:false).
 */

const { ensureUser, isManufacturingManager } = require('../../../utils/mfg-auth');
const stateMachine = require('../services/mfg-task-state-machine');

async function transition(ctx, fixedStatus) {
  const user = await ensureUser(ctx, strapi);
  if (!user) return;

  const { documentId } = ctx.params;
  const body = ctx.request.body?.data ?? ctx.request.body ?? {};
  const status = fixedStatus || body.status;
  const extra = fixedStatus ? body : (() => { const { status: _s, ...rest } = body; return rest; })();

  if (!documentId) return ctx.badRequest('documentId is required');
  if (!status) return ctx.badRequest('status is required');

  // Payroll-gating actions need a manager.
  if (status === 'Approved' || status === 'Rejected') {
    const ok = await isManufacturingManager(user.id, strapi);
    if (!ok) return ctx.forbidden('Only a manufacturing manager can approve or reject tasks');
  }

  try {
    const updated = await stateMachine.executeTransition(documentId, status, extra);
    return ctx.send({ success: true, data: updated });
  } catch (err) {
    strapi.log.warn(`[mfg-task/transition] ${documentId} → ${status} failed: ${err.message}`);
    return ctx.throw(err.status || 500, err.message);
  }
}

module.exports = {
  process(ctx) { return transition(ctx, null); },
  approve(ctx) { return transition(ctx, 'Approved'); },
  reject(ctx) { return transition(ctx, 'Rejected'); },
};
