'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser, resolveEmployeeForUser, managedReportDocIds, ownerUserIdForEmployeeRef } = require('../../../utils/hr-access');
const { loadActor, isPayrollManager } = require('../../../utils/payroll-access');

const LOAN_UID = 'api::pay-loan.pay-loan';

/** Report employee documentIds for the caller as a line manager ([] if none). */
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
    strapi.log.warn(`[pay-loan/notify] ${event.event_name} failed: ${err.message}`);
  }
}

module.exports = createCoreController(LOAN_UID, ({ strapi }) => ({
  /** Apply for a loan — self-service, employee forced to the caller's own record. */
  async requestLoan(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.badRequest('No employee record for this account');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const data = {
      principal_amount: body.principal_amount,
      installments_count: body.installments_count || 1,
      reason: body.reason || null,
      employee: employee.documentId,
      status: 'Requested',
    };
    const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
    if (ownerId) data.owners = [ownerId];

    const created = await strapi.documents(LOAN_UID).create({ data });
    return ctx.send({ data: created });
  },

  /** The caller's own loans (self-service). */
  async myLoans(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(LOAN_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      populate: ['currency'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Pending loan requests the caller may decide: payroll admin/manager -> org-wide; line manager -> their reports. */
  async teamLoans(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    let filters = { status: { $eq: 'Requested' } };
    if (!isPayrollManager(ctx, user)) {
      const reports = await callerReportDocIds(strapi, user);
      if (!reports.length) return ctx.send({ data: [] });
      filters = { status: { $eq: 'Requested' }, employee: { documentId: { $in: reports } } };
    }

    const rows = await strapi.documents(LOAN_UID).findMany({
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

/** Shared approve/reject path — payroll admin/manager org-wide, else the requester's line manager. */
async function decide(ctx, strapi, target) {
  const { documentId } = ctx.params;
  const user = await loadActor(ctx, strapi);
  if (!user) return ctx.unauthorized('You must be logged in');

  const current = await strapi.documents(LOAN_UID).findOne({
    documentId,
    populate: { employee: { fields: ['documentId'], populate: { user: { fields: ['id'] } } } },
  });
  if (!current) return ctx.notFound('Loan not found');

  if (!isPayrollManager(ctx, user)) {
    const reports = await callerReportDocIds(strapi, user);
    const targetDoc = current.employee?.documentId;
    if (!targetDoc || !reports.includes(targetDoc)) {
      return ctx.forbidden('You can only act on loan requests from your team');
    }
  }

  if (current.status !== 'Requested') {
    return ctx.badRequest(`This loan is already ${current.status} and cannot be changed.`);
  }

  const body = ctx.request.body?.data ?? ctx.request.body ?? {};
  const data = {
    status: target,
    decided_at: new Date().toISOString(),
    decided_by: user.id,
  };
  if (target === 'Rejected') data.rejection_reason = body.reason || null;
  if (target === 'Approved') {
    data.installment_amount = current.installments_count
      ? Number(current.principal_amount) / Number(current.installments_count)
      : Number(current.principal_amount);
    data.start_date = body.start_date || new Date().toISOString().slice(0, 10);
  }

  const updated = await strapi.documents(LOAN_UID).update({ documentId, data });

  const employeeUserId = current.employee?.user?.id;
  if (employeeUserId) {
    await notify(strapi, {
      event_name: target === 'Approved' ? 'hr.loan.approved' : 'hr.loan.rejected',
      entity_type: 'pay-loan',
      entity_id: documentId,
      payload: {
        user_id: employeeUserId,
        loan_id: documentId,
        principal_amount: current.principal_amount,
        reason: data.rejection_reason || undefined,
      },
    });
  }

  return ctx.send({ data: updated });
}
