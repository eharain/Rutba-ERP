'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser } = require('../../../utils/hr-access');

const ENROLL_UID = 'api::hr-benefit-enrollment.hr-benefit-enrollment';

module.exports = createCoreController(ENROLL_UID, ({ strapi }) => ({
  /** The caller's own benefit enrollments (self-service). */
  async myEnrollments(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id } });
    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(ENROLL_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      populate: ['benefit_plan'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },
}));
