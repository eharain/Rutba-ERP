'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser } = require('../../../utils/hr-access');

const ROSTER_UID = 'api::hr-roster.hr-roster';

module.exports = createCoreController(ROSTER_UID, ({ strapi }) => ({
  /** The caller's own upcoming/recent shift assignments. */
  async myRoster(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id } });
    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(ROSTER_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['date:desc'],
      populate: ['shift'],
      pagination: { pageSize: 100 },
    });
    return ctx.send({ data: rows || [] });
  },
}));
