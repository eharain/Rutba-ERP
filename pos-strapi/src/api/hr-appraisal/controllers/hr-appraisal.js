'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const {
  resolveEmployeeForUser,
  resolveOrCreateEmployeeForUser,
  isHrManager,
  managedReportDocIds,
  ownerUserIdForEmployeeRef,
} = require('../../../utils/hr-access');

const APP_UID = 'api::hr-appraisal.hr-appraisal';

async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: { role: { select: ['type'] } },
  });
}

/** Report employee documentIds for the caller as a line manager ([] if none). */
async function callerReportDocIds(strapi, user) {
  const emp = await resolveEmployeeForUser(strapi, user);
  if (!emp) return [];
  return managedReportDocIds(strapi, emp.documentId);
}

module.exports = createCoreController(APP_UID, ({ strapi }) => ({
  /**
   * The caller's own appraisals. Manager comments/ratings are intentionally
   * included — an employee is entitled to see their own completed review — but
   * only once the manager has submitted it (status Completed), so an in-progress
   * draft review stays private to the reviewer.
   */
  async myAppraisals(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(APP_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      populate: { cycle: { fields: ['name', 'status'] } },
      pagination: { pageSize: 200 },
    });

    const visible = (rows || []).map((r) => {
      if (r.status === 'Completed') return r;
      const { manager_rating, manager_comments, final_rating, ...rest } = r;
      return rest;
    });
    return ctx.send({ data: visible });
  },

  /** Appraisals the caller reviews: HR manager org-wide, line manager → reports. */
  async teamAppraisals(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    let filters = {};
    if (!isHrManager(ctx, user)) {
      const reports = await callerReportDocIds(strapi, user);
      if (!reports.length) return ctx.send({ data: [] });
      filters = { employee: { documentId: { $in: reports } } };
    }

    const rows = await strapi.documents(APP_UID).findMany({
      filters,
      sort: ['createdAt:desc'],
      populate: { employee: { fields: ['name'] }, cycle: { fields: ['name', 'status'] } },
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Employee submits their own self-assessment. */
  async submitSelfAssessment(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const { documentId } = ctx.params;
    const current = await strapi.documents(APP_UID).findOne({
      documentId,
      populate: { employee: { fields: ['documentId'] } },
    });
    if (!current) return ctx.notFound('Appraisal not found');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee || current.employee?.documentId !== employee.documentId) {
      return ctx.forbidden('You can only submit your own self-assessment');
    }
    if (['ManagerReview', 'Completed'].includes(current.status)) {
      return ctx.badRequest(`This appraisal is already at ${current.status} and cannot be re-submitted.`);
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const updated = await strapi.documents(APP_UID).update({
      documentId,
      data: {
        self_rating: body.self_rating ?? current.self_rating,
        self_comments: body.self_comments ?? current.self_comments,
        status: 'ManagerReview',
        submitted_at: new Date().toISOString(),
      },
    });
    return ctx.send({ data: updated });
  },

  /** Reviewer (HR manager org-wide, else line manager) completes the review. */
  async submitManagerReview(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const { documentId } = ctx.params;
    const current = await strapi.documents(APP_UID).findOne({
      documentId,
      populate: { employee: { fields: ['documentId'], populate: { user: { fields: ['id'] } } } },
    });
    if (!current) return ctx.notFound('Appraisal not found');

    if (!isHrManager(ctx, user)) {
      const reports = await callerReportDocIds(strapi, user);
      const targetDoc = current.employee?.documentId;
      if (!targetDoc || !reports.includes(targetDoc)) {
        return ctx.forbidden('You can only review appraisals for your team');
      }
    }
    if (current.status === 'Completed') {
      return ctx.badRequest('This appraisal is already completed.');
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const updated = await strapi.documents(APP_UID).update({
      documentId,
      data: {
        manager_rating: body.manager_rating ?? current.manager_rating,
        manager_comments: body.manager_comments ?? current.manager_comments,
        final_rating: body.final_rating ?? body.manager_rating ?? current.final_rating,
        status: 'Completed',
        completed_at: new Date().toISOString(),
      },
    });

    const employeeUserId = current.employee?.user?.id;
    if (employeeUserId) {
      try {
        await strapi.service('api::notification.notification-engine').processEvent({
          event_name: 'hr.appraisal.completed',
          entity_type: 'hr-appraisal',
          entity_id: documentId,
          payload: { user_id: employeeUserId, appraisal_id: documentId, final_rating: updated.final_rating },
        });
      } catch (err) {
        strapi.log.warn(`[hr-appraisal/notify] ${err.message}`);
      }
    }

    return ctx.send({ data: updated });
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
