'use strict';

/**
 * POST /pay-payroll-runs/:documentId/process  → aggregate + lock into payslips
 * POST /pay-payroll-runs/:documentId/cancel    → reverse a processed run
 *
 * Payroll-affecting, so gated to a super-admin or a payroll manager/admin.
 * Auth is manual (routes are auth:false).
 */

const { ensureUser } = require('../../../utils/mfg-auth');

const RUN_UID = 'api::pay-payroll-run.pay-payroll-run';

async function isPayrollManager(userId, strapi) {
  const user = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: userId },
    populate: { role: { select: ['type'] }, app_roles: { select: ['key'] } },
  });
  if (user?.role?.type === 'admin') return true;
  const keys = (user?.app_roles || []).map((r) => r?.key).filter(Boolean);
  return keys.some((k) => k === 'payroll_admin' || k === 'payroll_manager');
}

module.exports = {
  async run(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;
    if (!(await isPayrollManager(user.id, strapi))) {
      return ctx.forbidden('Only a payroll manager can process a payroll run');
    }
    const { documentId } = ctx.params;
    try {
      const result = await strapi.service(RUN_UID).processRun(documentId);
      return ctx.send({ success: true, ...result });
    } catch (err) {
      strapi.log.warn(`[payroll/process] ${documentId} failed: ${err.message}`);
      return ctx.throw(err.status || 500, err.message);
    }
  },

  async cancel(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;
    if (!(await isPayrollManager(user.id, strapi))) {
      return ctx.forbidden('Only a payroll manager can cancel a payroll run');
    }
    const { documentId } = ctx.params;
    try {
      const result = await strapi.service(RUN_UID).cancelRun(documentId);
      return ctx.send({ success: true, ...result });
    } catch (err) {
      strapi.log.warn(`[payroll/cancel] ${documentId} failed: ${err.message}`);
      return ctx.throw(err.status || 500, err.message);
    }
  },
};
