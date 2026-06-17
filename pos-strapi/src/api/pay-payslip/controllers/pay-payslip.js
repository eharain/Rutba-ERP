'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const PS_UID = 'api::pay-payslip.pay-payslip';
const PR_UID = 'api::pay-payroll-run.pay-payroll-run';

async function getAuthUser(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: {
      role: { select: ['type'] },
      permission_roles: { select: ['level'], populate: { domain: { select: ['key'] } } },
    },
  });
}

function isPayrollManager(user) {
  if (user?.role?.type === 'admin') return true;
  const adminDomains = (user?.permission_roles || [])
    .filter((r) => r?.level === 'admin')
    .map((r) => r?.domain?.key)
    .filter(Boolean);
  return adminDomains.includes('payroll') || adminDomains.includes('auth');
}

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
    const user = await getAuthUser(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');
    if (!isPayrollManager(user)) return ctx.forbidden('Payroll access is required');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    try {
      const data = await strapi.service(PR_UID).markPayslipPaid(ctx.params.documentId, { ...body, user });
      return ctx.send({ data });
    } catch (e) {
      return ctx.throw(e.status || 500, e.message);
    }
  },
}));
