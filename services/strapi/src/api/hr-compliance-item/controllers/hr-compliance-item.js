'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const {
  resolveEmployeeForUser,
  resolveOrCreateEmployeeForUser,
  isHrManager,
  managedReportDocIds,
  ownerUserIdForEmployeeRef,
} = require('../../../utils/hr-access');

const CI_UID = 'api::hr-compliance-item.hr-compliance-item';

async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: { role: { select: ['type'] } },
  });
}

module.exports = createCoreController(CI_UID, ({ strapi }) => ({
  /** The caller's own compliance items — contract, visa, licences, medicals. */
  async myComplianceItems(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(CI_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['expiry_date:asc'],
      populate: ['document'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /**
   * Items expiring within `days` (default 60). HR manager → org-wide; a line
   * manager → their reports only; anyone else → their own. Keeps the same
   * three-tier shape as the rest of the module.
   */
  async expiringItems(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const days = Math.min(Number(ctx.query?.days) || 60, 365);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const base = {
      expiry_date: { $lte: cutoffStr, $notNull: true },
      status: { $ne: 'Waived' },
    };

    let filters = base;
    if (!isHrManager(ctx, user)) {
      const emp = await resolveEmployeeForUser(strapi, user);
      const reports = emp ? await managedReportDocIds(strapi, emp.documentId) : [];
      const scope = emp ? [...reports, emp.documentId] : reports;
      if (!scope.length) return ctx.send({ data: [] });
      filters = { ...base, employee: { documentId: { $in: scope } } };
    }

    const rows = await strapi.documents(CI_UID).findMany({
      filters,
      sort: ['expiry_date:asc'],
      populate: { employee: { fields: ['name'] } },
      pagination: { pageSize: 500 },
    });
    return ctx.send({ data: rows || [] });
  },

  async create(ctx) {
    ctx.request.body = ctx.request.body || {};
    const data = ctx.request.body.data || ctx.request.body || {};
    if (!data.owners) {
      const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
      if (ownerId) data.owners = [ownerId];
    }
    ctx.request.body.data = data;
    return super.create(ctx);
  },
}));
