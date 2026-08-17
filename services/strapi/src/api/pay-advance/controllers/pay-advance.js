'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser, resolveEmployeeForUser, managedReportDocIds, ownerUserIdForEmployeeRef } = require('../../../utils/hr-access');
const { loadActor, isPayrollManager } = require('../../../utils/payroll-access');

const ADV_UID = 'api::pay-advance.pay-advance';

async function callerReportDocIds(strapi, user) {
  const emp = await resolveEmployeeForUser(strapi, user);
  if (!emp) return [];
  return managedReportDocIds(strapi, emp.documentId);
}

/** Best-effort in-app notification — never let a delivery failure fail the request. */
async function notify(strapi, event) {
  try {
    await strapi.service('api::notification.notification-engine').processEvent(event);
  } catch (err) {
    strapi.log.warn(`[pay-advance/notify] ${event.event_name} failed: ${err.message}`);
  }
}

module.exports = createCoreController(ADV_UID, ({ strapi }) => ({
  /** Request a salary advance — self-service, employee forced to the caller's own record. */
  async requestAdvance(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.badRequest('No employee record for this account');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const data = {
      amount: body.amount,
      reason: body.reason || null,
      requested_date: new Date().toISOString().slice(0, 10),
      employee: employee.documentId,
      status: 'Requested',
    };
    const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
    if (ownerId) data.owners = [ownerId];

    const created = await strapi.documents(ADV_UID).create({ data });
    return ctx.send({ data: created });
  },

  /** The caller's own advances (self-service). */
  async myAdvances(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(ADV_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      populate: ['currency'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Pending advance requests the caller may decide: payroll admin/manager -> org-wide; line manager -> their reports. */
  async teamAdvances(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    let filters = { status: { $eq: 'Requested' } };
    if (!isPayrollManager(ctx, user)) {
      const reports = await callerReportDocIds(strapi, user);
      if (!reports.length) return ctx.send({ data: [] });
      filters = { status: { $eq: 'Requested' }, employee: { documentId: { $in: reports } } };
    }

    const rows = await strapi.documents(ADV_UID).findMany({
      filters,
      sort: ['createdAt:desc'],
      populate: { employee: { fields: ['name'] }, currency: true },
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  async approve(ctx) {
    return decide(ctx, strapi, 'Approved');
  },

  async reject(ctx) {
    return decide(ctx, strapi, 'Rejected');
  },
}));

async function decide(ctx, strapi, target) {
  const { documentId } = ctx.params;
  const user = await loadActor(ctx, strapi);
  if (!user) return ctx.unauthorized('You must be logged in');

  const current = await strapi.documents(ADV_UID).findOne({
    documentId,
    populate: { employee: { fields: ['documentId'], populate: { user: { fields: ['id'] } } } },
  });
  if (!current) return ctx.notFound('Advance not found');

  if (!isPayrollManager(ctx, user)) {
    const reports = await callerReportDocIds(strapi, user);
    const targetDoc = current.employee?.documentId;
    if (!targetDoc || !reports.includes(targetDoc)) {
      return ctx.forbidden('You can only act on advance requests from your team');
    }
  }

  if (current.status !== 'Requested') {
    return ctx.badRequest(`This advance is already ${current.status} and cannot be changed.`);
  }

  const body = ctx.request.body?.data ?? ctx.request.body ?? {};
  const data = { status: target, decided_at: new Date().toISOString(), decided_by: user.id };
  if (target === 'Rejected') data.rejection_reason = body.reason || null;

  const updated = await strapi.documents(ADV_UID).update({ documentId, data });

  const employeeUserId = current.employee?.user?.id;
  if (employeeUserId) {
    await notify(strapi, {
      event_name: target === 'Approved' ? 'hr.advance.approved' : 'hr.advance.rejected',
      entity_type: 'pay-advance',
      entity_id: documentId,
      payload: {
        user_id: employeeUserId,
        advance_id: documentId,
        amount: current.amount,
        reason: data.rejection_reason || undefined,
      },
    });
  }

  return ctx.send({ data: updated });
}
