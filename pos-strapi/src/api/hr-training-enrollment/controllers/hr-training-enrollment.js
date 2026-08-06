'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const {
  resolveEmployeeForUser,
  resolveOrCreateEmployeeForUser,
  isHrManager,
  managedReportDocIds,
  ownerUserIdForEmployeeRef,
} = require('../../../utils/hr-access');

const ENR_UID = 'api::hr-training-enrollment.hr-training-enrollment';
const SESSION_UID = 'api::hr-training-session.hr-training-session';

async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: { role: { select: ['type'] } },
  });
}

module.exports = createCoreController(ENR_UID, ({ strapi }) => ({
  /** The caller's own training record (self-service). */
  async myTrainings(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(ENR_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      populate: {
        session: { fields: ['start_date', 'end_date', 'location', 'status'], populate: { course: { fields: ['name', 'code', 'delivery_mode'] } } },
        certificate: true,
      },
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Self-enroll onto an open session — employee is forced to the caller. */
  async enrollMe(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.badRequest('No employee record for this account');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const sessionDocId = body.session;
    if (!sessionDocId) return ctx.badRequest('A session is required');

    const session = await strapi.documents(SESSION_UID).findOne({ documentId: sessionDocId });
    if (!session) return ctx.notFound('Session not found');
    if (['Completed', 'Cancelled'].includes(session.status)) {
      return ctx.badRequest(`This session is ${session.status} and is not open for enrollment.`);
    }

    // Idempotent re-click: return the existing place rather than duplicating it.
    const existing = await strapi.documents(ENR_UID).findMany({
      filters: {
        employee: { documentId: { $eq: employee.documentId } },
        session: { documentId: { $eq: sessionDocId } },
      },
      pagination: { pageSize: 1 },
    });
    if (existing?.[0]) return ctx.send({ data: existing[0] });

    if (session.capacity) {
      const taken = await strapi.documents(ENR_UID).count({
        filters: { session: { documentId: { $eq: sessionDocId } }, status: { $ne: 'Dropped' } },
      });
      if (taken >= session.capacity) return ctx.badRequest('This session is full.');
    }

    const data = { employee: employee.documentId, session: sessionDocId, status: 'Enrolled' };
    const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
    if (ownerId) data.owners = [ownerId];

    const created = await strapi.documents(ENR_UID).create({ data });
    return ctx.send({ data: created });
  },

  /** HR/trainer marks an enrollment complete (org-wide HR, else line manager). */
  async markComplete(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const { documentId } = ctx.params;
    const current = await strapi.documents(ENR_UID).findOne({
      documentId,
      populate: { employee: { fields: ['documentId'], populate: { user: { fields: ['id'] } } } },
    });
    if (!current) return ctx.notFound('Enrollment not found');

    if (!isHrManager(ctx, user)) {
      const emp = await resolveEmployeeForUser(strapi, user);
      const reports = emp ? await managedReportDocIds(strapi, emp.documentId) : [];
      const targetDoc = current.employee?.documentId;
      if (!targetDoc || !reports.includes(targetDoc)) {
        return ctx.forbidden('You can only complete training for your team');
      }
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const updated = await strapi.documents(ENR_UID).update({
      documentId,
      data: {
        status: 'Completed',
        completion_date: body.completion_date || new Date().toISOString().slice(0, 10),
        score: body.score ?? current.score,
        feedback: body.feedback ?? current.feedback,
      },
    });

    const employeeUserId = current.employee?.user?.id;
    if (employeeUserId) {
      try {
        await strapi.service('api::notification.notification-engine').processEvent({
          event_name: 'hr.training.completed',
          entity_type: 'hr-training-enrollment',
          entity_id: documentId,
          payload: { user_id: employeeUserId, enrollment_id: documentId },
        });
      } catch (err) {
        strapi.log.warn(`[hr-training-enrollment/notify] ${err.message}`);
      }
    }

    return ctx.send({ data: updated });
  },
}));
