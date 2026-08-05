'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser, resolveEmployeeForUser, managedReportDocIds } = require('../../../utils/hr-access');
const { loadActor, isPayrollManager } = require('../../../utils/payroll-access');

const BONUS_UID = 'api::pay-bonus.pay-bonus';

module.exports = createCoreController(BONUS_UID, ({ strapi }) => ({
  /** The caller's own bonuses (self-service). */
  async myBonuses(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(BONUS_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      populate: ['currency'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Bonuses for the caller's reports: payroll admin/manager -> org-wide; line manager -> their reports. */
  async teamBonuses(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    let filters = {};
    if (!isPayrollManager(ctx, user)) {
      const employee = await resolveEmployeeForUser(strapi, user);
      const reports = employee ? await managedReportDocIds(strapi, employee.documentId) : [];
      if (!reports.length) return ctx.send({ data: [] });
      filters = { employee: { documentId: { $in: reports } } };
    }

    const rows = await strapi.documents(BONUS_UID).findMany({
      filters,
      sort: ['createdAt:desc'],
      populate: { employee: { fields: ['name'] }, currency: true },
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },
}));
