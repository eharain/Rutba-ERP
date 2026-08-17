'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser, resolveEmployeeForUser, managedReportDocIds, managerUserIdsForEmployee, ownerUserIdForEmployeeRef } = require('../../../utils/hr-access');
const { loadActor, isPayrollManager, isPayrollAdmin } = require('../../../utils/payroll-access');

const CLAIM_UID = 'api::hr-expense-claim.hr-expense-claim';

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
    strapi.log.warn(`[hr-expense-claim/notify] ${event.event_name} failed: ${err.message}`);
  }
}

module.exports = createCoreController(CLAIM_UID, ({ strapi }) => ({
  /** Submit an expense claim — self-service, employee forced to the caller's own record. */
  async submitClaim(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.badRequest('No employee record for this account');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const data = {
      claim_date: body.claim_date || new Date().toISOString().slice(0, 10),
      category: body.category || 'Other',
      description: body.description || null,
      amount: body.amount,
      employee: employee.documentId,
      status: 'Submitted',
    };
    const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
    if (ownerId) data.owners = [ownerId];

    const created = await strapi.documents(CLAIM_UID).create({ data });

    const managerUserIds = await managerUserIdsForEmployee(strapi, employee.documentId);
    for (const managerUserId of managerUserIds) {
      await notify(strapi, {
        event_name: 'hr.expense.submitted',
        entity_type: 'hr-expense-claim',
        entity_id: created.documentId,
        payload: {
          user_id: managerUserId,
          claim_id: created.documentId,
          amount: created.amount,
          employee_name: employee.name,
        },
      });
    }

    return ctx.send({ data: created });
  },

  /** The caller's own claims (self-service). */
  async myClaims(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(CLAIM_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      populate: ['currency'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Pending claims the caller may decide: payroll admin/manager -> org-wide; line manager -> their reports. */
  async teamClaims(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    let filters = { status: { $eq: 'Submitted' } };
    if (!isPayrollManager(ctx, user)) {
      const reports = await callerReportDocIds(strapi, user);
      if (!reports.length) return ctx.send({ data: [] });
      filters = { status: { $eq: 'Submitted' }, employee: { documentId: { $in: reports } } };
    }

    const rows = await strapi.documents(CLAIM_UID).findMany({
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

  /** Finance processes reimbursement: payroll admin only, posts the payout journal entry. */
  async reimburse(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');
    if (!isPayrollAdmin(ctx, user)) return ctx.forbidden('Payroll access is required');

    const { documentId } = ctx.params;
    const current = await strapi.documents(CLAIM_UID).findOne({
      documentId,
      populate: { account: true, branch: true, employee: { fields: ['documentId'], populate: { user: { fields: ['id'] } } } },
    });
    if (!current) return ctx.notFound('Claim not found');
    if (current.status !== 'Approved') {
      return ctx.badRequest(`This claim is ${current.status}, not Approved — it cannot be reimbursed.`);
    }

    try {
      const accounting = strapi.service('api::acc-journal-entry.accounting');
      const resolver = strapi.service('api::acc-journal-entry.account-resolver');
      const branchId = current.branch?.id || null;
      const amount = Number(current.amount || 0);

      let expenseAccountId = current.account?.id || null;
      if (!expenseAccountId) expenseAccountId = await resolver.resolve('OPERATING_EXPENSES', branchId);
      const cashAccountId = await resolver.resolve('CASH_DRAWER', branchId);

      const entry = await accounting.createAndPost({
        date: new Date(),
        description: `Expense reimbursement: ${current.category}${current.description ? ' — ' + current.description : ''}`,
        source_type: 'HR Expense Claim',
        source_id: current.id,
        source_ref: `EXPCLAIM-${current.id}`,
        lines: [
          { account: expenseAccountId, debit: amount, credit: 0, description: current.description || current.category },
          { account: cashAccountId, debit: 0, credit: amount, description: 'Reimbursement paid' },
        ],
        branch: branchId,
      });

      // entityService.update takes the numeric id and a bare relation id directly
      // (matches acc-expense's lifecycle — the documents() service needs an
      // explicit connect/disconnect verb for relation updates, entityService doesn't).
      const updated = await strapi.entityService.update(CLAIM_UID, current.id, {
        data: { status: 'Reimbursed', journal_entry: entry.id },
      });

      const employeeUserId = current.employee?.user?.id;
      if (employeeUserId) {
        await notify(strapi, {
          event_name: 'hr.expense.reimbursed',
          entity_type: 'hr-expense-claim',
          entity_id: documentId,
          payload: { user_id: employeeUserId, claim_id: documentId, amount },
        });
      }

      return ctx.send({ data: updated });
    } catch (err) {
      strapi.log.error(`[hr-expense-claim/reimburse] ${documentId} failed: ${err.message}`);
      return ctx.throw(err.status || 500, err.message);
    }
  },
}));

/** Shared approve/reject path — payroll admin/manager org-wide, else the requester's line manager. */
async function decide(ctx, strapi, target) {
  const { documentId } = ctx.params;
  const user = await loadActor(ctx, strapi);
  if (!user) return ctx.unauthorized('You must be logged in');

  const current = await strapi.documents(CLAIM_UID).findOne({
    documentId,
    populate: { employee: { fields: ['documentId'], populate: { user: { fields: ['id'] } } } },
  });
  if (!current) return ctx.notFound('Claim not found');

  if (!isPayrollManager(ctx, user)) {
    const reports = await callerReportDocIds(strapi, user);
    const targetDoc = current.employee?.documentId;
    if (!targetDoc || !reports.includes(targetDoc)) {
      return ctx.forbidden('You can only act on claims from your team');
    }
  }

  if (current.status !== 'Submitted') {
    return ctx.badRequest(`This claim is already ${current.status} and cannot be changed.`);
  }

  const body = ctx.request.body?.data ?? ctx.request.body ?? {};
  const data = { status: target, decided_at: new Date().toISOString(), decided_by: user.id };
  if (target === 'Rejected') data.rejection_reason = body.reason || null;

  const updated = await strapi.documents(CLAIM_UID).update({ documentId, data });

  const employeeUserId = current.employee?.user?.id;
  if (employeeUserId) {
    await notify(strapi, {
      event_name: target === 'Approved' ? 'hr.expense.approved' : 'hr.expense.rejected',
      entity_type: 'hr-expense-claim',
      entity_id: documentId,
      payload: {
        user_id: employeeUserId,
        claim_id: documentId,
        amount: current.amount,
        reason: data.rejection_reason || undefined,
      },
    });
  }

  return ctx.send({ data: updated });
}
