'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser, ownerUserIdForEmployeeRef } = require('../../../utils/hr-access');

const GOAL_UID = 'api::hr-goal.hr-goal';

// The employee may move their own goal along; everything that defines the goal
// (title, weight, target date, cycle, employee) stays manager-owned.
const SELF_EDITABLE_FIELDS = ['progress_percent', 'status', 'description'];

async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({ where: { id } });
}

module.exports = createCoreController(GOAL_UID, ({ strapi }) => ({
  /** The caller's own goals (self-service). */
  async myGoals(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(GOAL_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['target_date:asc', 'createdAt:desc'],
      populate: { cycle: { fields: ['name', 'status'] } },
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Self-update of progress/status only, and only on a goal the caller owns. */
  async updateMyGoal(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const { documentId } = ctx.params;
    const current = await strapi.documents(GOAL_UID).findOne({
      documentId,
      populate: { employee: { fields: ['documentId'] } },
    });
    if (!current) return ctx.notFound('Goal not found');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee || current.employee?.documentId !== employee.documentId) {
      return ctx.forbidden('You can only update your own goals');
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const data = {};
    for (const field of SELF_EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) data[field] = body[field];
    }

    const updated = await strapi.documents(GOAL_UID).update({ documentId, data });
    return ctx.send({ data: updated });
  },

  /** HR/manager creates a goal — mirrors `owners` onto the target employee's user. */
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
