'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveEmployeeForUser, resolveOrCreateEmployeeForUser, isHrManager, managedReportDocIds } = require('../../../utils/hr-access');

const ATT_UID = 'api::hr-attendance.hr-attendance';

async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: { role: { select: ['type'] } },
  });
}

module.exports = createCoreController(ATT_UID, ({ strapi }) => ({
  /** The caller's own attendance history (employee self-service, ownership-scoped). */
  async myAttendance(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(ATT_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['date:desc'],
      populate: ['employee'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Attendance for the caller's reports: HR manager/admin -> org-wide; line manager -> their reports; anyone else -> empty. */
  async teamAttendance(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    let filters = {};
    if (!isHrManager(ctx, user)) {
      const employee = await resolveEmployeeForUser(strapi, user);
      const reports = employee ? await managedReportDocIds(strapi, employee.documentId) : [];
      if (!reports.length) return ctx.send({ data: [] });
      filters = { employee: { documentId: { $in: reports } } };
    }

    const rows = await strapi.documents(ATT_UID).findMany({
      filters,
      sort: ['date:desc'],
      populate: ['employee'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },
}));
