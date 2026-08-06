'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');

const PS_UID = 'api::pay-payslip.pay-payslip';
const PR_UID = 'api::pay-payroll-run.pay-payroll-run';

module.exports = createCoreController(PS_UID, ({ strapi }) => ({
  /** Employee self-service: the logged-in user's own payslips. */
  async myPayslips(ctx) {
    const uid = ctx.state?.user?.id;
    if (!uid) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: uid },
      populate: { hr_employee: { select: ['documentId'] } },
    });
    const empDocId = user?.hr_employee?.documentId;
    if (!empDocId) return ctx.send({ data: [] });

    const rows = await strapi.documents(PS_UID).findMany({
      filters: { employee: { documentId: empDocId } },
      sort: ['createdAt:desc'],
      populate: { lines: true, employee: { fields: ['name'] } },
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Mark a payslip paid and post the payout journal entry. */
  async markPaid(ctx) {
    // requireAppRole reads the caller's REAL app_roles. The previous guard
    // populated a `permission_roles` relation that has no schema, so it always
    // came back empty and every non-super-admin was refused — meaning nobody
    // but a Strapi super-admin could ever trigger the payout posting.
    const user = await requireAppRole(ctx, strapi, {
      domains: ['payroll', 'auth'],
      levels: ['admin', 'manager'],
      message: 'Payroll access is required',
    });
    if (!user) return;

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    try {
      const data = await strapi.service(PR_UID).markPayslipPaid(ctx.params.documentId, { ...body, user });
      return ctx.send({ data });
    } catch (e) {
      return ctx.throw(e.status || 500, e.message);
    }
  },
}));
