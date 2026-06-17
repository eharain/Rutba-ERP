'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const stateMachine = require('../services/hr-leave-request-state-machine');
const { resolveEmployeeForUser, isHrManager, managedReportDocIds } = require('../../../utils/hr-access');

const LR_UID = 'api::hr-leave-request.hr-leave-request';

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
    populate: { employee: { fields: ['documentId', 'name'] } },
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
    if (!isHrActor || !data.employee) {
      const emp = await resolveEmployeeForUser(strapi, user);
      if (emp) data.employee = emp.documentId;
    }
    ctx.request.body.data = data;
    return super.create(ctx);
  },

  /** The caller's own requests (employee self-service, ownership-scoped). */
  async myRequests(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(LR_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      populate: ['employee'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
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
