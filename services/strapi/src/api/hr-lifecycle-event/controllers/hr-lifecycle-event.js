'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser, ownerUserIdForEmployeeRef } = require('../../../utils/hr-access');

const LE_UID = 'api::hr-lifecycle-event.hr-lifecycle-event';

module.exports = createCoreController(LE_UID, ({ strapi }) => ({
  /** The caller's own lifecycle history (onboarding, promotions, transfers, etc.). */
  async myTimeline(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id } });
    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(LE_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['effective_date:desc', 'createdAt:desc'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** HR logs an event for an employee — mirrors `owners` onto the target employee's user. */
  async create(ctx) {
    ctx.request.body = ctx.request.body || {};
    const data = ctx.request.body.data || ctx.request.body || {};
    const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
    if (!data.owners && ownerId) data.owners = [ownerId];
    ctx.request.body.data = data;
    const response = await super.create(ctx);

    const created = response?.data;
    if (created?.documentId && ownerId) {
      try {
        await strapi.service('api::notification.notification-engine').processEvent({
          event_name: 'hr.lifecycle.recorded',
          entity_type: 'hr-lifecycle-event',
          entity_id: created.documentId,
          payload: {
            user_id: ownerId,
            lifecycle_event_id: created.documentId,
            event_type: created.type,
            effective_date: created.effective_date,
          },
        });
      } catch (err) {
        strapi.log.warn(`[hr-lifecycle-event/notify] ${err.message}`);
      }
    }
    return response;
  },
}));
