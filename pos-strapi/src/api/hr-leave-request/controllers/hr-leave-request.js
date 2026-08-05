'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const stateMachine = require('../services/hr-leave-request-state-machine');
const { resolveEmployeeForUser, resolveOrCreateEmployeeForUser, isHrManager, managedReportDocIds, managerUserIdsForEmployee, ownerUserIdForEmployeeRef } = require('../../../utils/hr-access');
const { computeAllLeaveBalances } = require('../../../utils/leave-balance');

const LR_UID = 'api::hr-leave-request.hr-leave-request';
const EMP_UID = 'api::hr-employee.hr-employee';

/** Best-effort in-app notification — never let a delivery failure fail the request. */
async function notify(strapi, event) {
  try {
    await strapi.service('api::notification.notification-engine').processEvent(event);
  } catch (err) {
    strapi.log.warn(`[hr-leave-request/notify] ${event.event_name} failed: ${err.message}`);
  }
}

/** Load the caller with the relations the HR auth checks need. */
async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: {
      role: { select: ['type'] },
    },
  });
}

/** Report employee documentIds for the caller as a line manager ([] if none). */
async function callerReportDocIds(strapi, user) {
  const emp = await resolveEmployeeForUser(strapi, user);
  if (!emp) return [];
  return managedReportDocIds(strapi, emp.documentId);
}

/**
 * Shared approve/reject path. Authority is two-axis: an HR manager/admin acts
 * org-wide; otherwise the caller must be the line manager of the requester
 * (the request's employee is one of their reports). Delegates the transition +
 * side effects to the state machine.
 */
async function decide(ctx, strapi, target) {
  const { documentId } = ctx.params;
  const user = await loadActor(ctx, strapi);
  if (!user) return ctx.unauthorized('You must be logged in');

  const current = await strapi.documents(LR_UID).findOne({
    documentId,
    populate: { employee: { fields: ['documentId', 'name'], populate: { user: { fields: ['id'] } } } },
  });
  if (!current) return ctx.notFound('Leave request not found');

  if (!isHrManager(ctx, user)) {
    const reports = await callerReportDocIds(strapi, user);
    const targetDoc = current.employee?.documentId;
    if (!targetDoc || !reports.includes(targetDoc)) {
      return ctx.forbidden('You can only act on leave requests from your team');
    }
  }

  if (current.status === target) return ctx.send({ data: current }); // idempotent re-click
  if (['Approved', 'Rejected', 'Cancelled'].includes(current.status)) {
    return ctx.badRequest(`This request is already ${current.status} and cannot be changed.`);
  }

  const body = ctx.request.body?.data ?? ctx.request.body ?? {};
  const reason = body.reason || body.rejection_reason || null;

  try {
    const updated = await stateMachine.executeTransition(documentId, target, { userDocumentId: user.documentId, reason });

    const employeeUserId = current.employee?.user?.id;
    if (employeeUserId) {
      await notify(strapi, {
        event_name: target === 'Approved' ? 'hr.leave.approved' : 'hr.leave.rejected',
        entity_type: 'hr-leave-request',
        entity_id: documentId,
        payload: {
          user_id: employeeUserId,
          leave_request_id: documentId,
          leave_type: current.leave_type,
          reason: reason || undefined,
        },
      });
    }

    return ctx.send({ data: updated });
  } catch (err) {
    strapi.log.warn(`[hr-leave-request/${target}] ${documentId} failed: ${err.message}`);
    return ctx.throw(err.status || 500, err.message);
  }
}

module.exports = createCoreController(LR_UID, ({ strapi }) => ({
  /**
   * Apply for leave. Self-service defaults the employee to the caller's own
   * record; HR staff may file on behalf of others by passing an explicit
   * employee in the payload.
   */
  async create(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');
    ctx.request.body = ctx.request.body || {};
    const data = ctx.request.body.data || ctx.request.body || {};
    // Self-service (ess / any non-HR claim) may only file for themselves; an HR
    // claim (hr_*) or super-admin may file on behalf of others via an explicit
    // employee. Force the caller's own employee unless they are acting as HR.
    const roleKey = ctx.state?.apiProClaim?.roleKey || '';
    const isHrActor = user.role?.type === 'admin' || roleKey.startsWith('hr_');
    let resolvedEmployee = null;
    if (!isHrActor || !data.employee) {
      resolvedEmployee = await resolveOrCreateEmployeeForUser(strapi, user);
      if (resolvedEmployee) data.employee = resolvedEmployee.documentId;
    }
    // Mirror the repo-wide `owners` ownership convention (data consistency only —
    // self/report scoping above and in myRequests/teamQueue stays on `employee`).
    if (!data.owners) {
      const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
      if (ownerId) data.owners = [ownerId];
    }
    ctx.request.body.data = data;
    const response = await super.create(ctx);

    const created = response?.data;
    if (created?.documentId && typeof data.employee === 'string') {
      const employeeName = resolvedEmployee?.name
        || (await strapi.documents(EMP_UID).findOne({ documentId: data.employee, fields: ['name'] }))?.name
        || 'An employee';
      const managerUserIds = await managerUserIdsForEmployee(strapi, data.employee);
      for (const managerUserId of managerUserIds) {
        await notify(strapi, {
          event_name: 'hr.leave.submitted',
          entity_type: 'hr-leave-request',
          entity_id: created.documentId,
          payload: {
            user_id: managerUserId,
            leave_request_id: created.documentId,
            leave_type: created.leave_type,
            employee_name: employeeName,
          },
        });
      }
    }
    return response;
  },

  /** The caller's own requests (employee self-service, ownership-scoped). */
  async myRequests(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(LR_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      populate: ['employee'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** The caller's leave balances for every leave type, for a given year (default: this year). */
  async myBalances(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const year = Number(ctx.query?.year) || new Date().getFullYear();
    const balances = await computeAllLeaveBalances(strapi, employee.documentId, year);
    return ctx.send({ data: balances });
  },

  /**
   * Pending requests the caller may act on: HR manager/admin → org-wide;
   * line manager → only their reports'; anyone else → empty.
   */
  async teamQueue(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    let filters = { status: { $eq: 'Pending' } };
    if (!isHrManager(ctx, user)) {
      const reports = await callerReportDocIds(strapi, user);
      if (!reports.length) return ctx.send({ data: [] });
      filters = { status: { $eq: 'Pending' }, employee: { documentId: { $in: reports } } };
    }

    const rows = await strapi.documents(LR_UID).findMany({
      filters,
      sort: ['createdAt:desc'],
      populate: ['employee'],
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

  /** Cancel: the owning employee, the line manager of the requester, or HR manager. */
  async cancel(ctx) {
    const { documentId } = ctx.params;
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const current = await strapi.documents(LR_UID).findOne({
      documentId,
      populate: { employee: { fields: ['documentId'], populate: ['user'] } },
    });
    if (!current) return ctx.notFound('Leave request not found');

    const ownerUserId = current.employee?.user?.id;
    let allowed = (ownerUserId && ownerUserId === user.id) || isHrManager(ctx, user);
    if (!allowed) {
      const reports = await callerReportDocIds(strapi, user);
      const targetDoc = current.employee?.documentId;
      allowed = !!targetDoc && reports.includes(targetDoc);
    }
    if (!allowed) return ctx.forbidden('You can only cancel your own request');

    if (current.status === 'Cancelled') return ctx.send({ data: current });
    if (current.status === 'Rejected') return ctx.badRequest('A rejected request cannot be cancelled');

    try {
      const updated = await stateMachine.executeTransition(documentId, 'Cancelled', { userDocumentId: user.documentId });
      return ctx.send({ data: updated });
    } catch (err) {
      strapi.log.warn(`[hr-leave-request/cancel] ${documentId} failed: ${err.message}`);
      return ctx.throw(err.status || 500, err.message);
    }
  },
}));
