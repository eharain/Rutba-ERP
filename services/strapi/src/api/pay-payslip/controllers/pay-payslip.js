'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveEmployeeForUser, resolveOrCreateEmployeeForUser, managedReportDocIds } = require('../../../utils/hr-access');
const { loadActor, isPayrollManager, isPayrollAdmin } = require('../../../utils/payroll-access');

const PS_UID = 'api::pay-payslip.pay-payslip';
const PR_UID = 'api::pay-payroll-run.pay-payroll-run';

module.exports = createCoreController(PS_UID, ({ strapi }) => ({
  /** Employee self-service: the logged-in user's own payslips. */
  async myPayslips(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(PS_UID).findMany({
      filters: { employee: { documentId: employee.documentId } },
      sort: ['createdAt:desc'],
      populate: { lines: true, employee: { fields: ['name'] } },
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Payslips for the caller's reports: payroll admin/manager -> org-wide; line manager -> their reports; anyone else -> empty. */
  async teamPayslips(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    let filters = {};
    if (!isPayrollManager(ctx, user)) {
      const employee = await resolveEmployeeForUser(strapi, user);
      const reports = employee ? await managedReportDocIds(strapi, employee.documentId) : [];
      if (!reports.length) return ctx.send({ data: [] });
      filters = { employee: { documentId: { $in: reports } } };
    }

    const rows = await strapi.documents(PS_UID).findMany({
      filters,
      sort: ['createdAt:desc'],
      populate: { employee: { fields: ['name'] } },
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Mark a payslip paid and post the payout journal entry. */
  async markPaid(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');
    if (!isPayrollAdmin(ctx, user)) return ctx.forbidden('Payroll access is required');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    try {
      const data = await strapi.service(PR_UID).markPayslipPaid(ctx.params.documentId, { ...body, user });
      return ctx.send({ data });
    } catch (e) {
      return ctx.throw(e.status || 500, e.message);
    }
  },
}));
