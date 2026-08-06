'use strict';

/**
 * pay-adjustment controller
 *
 * Extended with `disburse` — books the cash actually handed to an employee for
 * an advance or loan.
 *
 * Why it exists: the payroll engine CREDITS `EMPLOYEE_ADVANCES` every period it
 * recovers an instalment (pay-payroll-run `_postAccrual`), but nothing ever
 * DEBITED it. Advances were paid out of the drawer with no journal entry at
 * all, so the asset account drifted negative by the full value of every
 * advance ever recovered. This is the missing debit side.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');

const ADJ_UID = 'api::pay-adjustment.pay-adjustment';

// Mirrors PAYOUT_METHOD_KEY in pay-payroll-run — same cash accounts, so an
// advance and a payslip paid the same way hit the same ledger account.
const PAYOUT_METHOD_KEY = { Cash: 'CASH_DRAWER', Bank: 'BANK_PRIMARY', 'Mobile Wallet': 'MOBILE_WALLET' };

const RECOVERABLE = ['advance', 'loan'];

module.exports = createCoreController(ADJ_UID, ({ strapi }) => ({
  /**
   * POST /pay-adjustments/:documentId/disburse
   *
   * Dr EMPLOYEE_ADVANCES / Cr cash-or-bank for the advance amount, then stamp
   * the disbursement. Idempotent via findBySource + manager-gated.
   *
   * Body: { method?: 'Cash' | 'Bank' | 'Mobile Wallet' }
   */
  async disburse(ctx) {
    const user = await requireAppRole(ctx, strapi, {
      domains: ['payroll', 'accounts'],
      levels: ['admin', 'manager'],
      message: 'Payroll access is required',
    });
    if (!user) return;

    const { documentId } = ctx.params;
    const body = ctx.request?.body?.data || ctx.request?.body || {};

    const adj = await strapi.documents(ADJ_UID).findOne({
      documentId,
      populate: { employee: { fields: ['id', 'documentId', 'name'] } },
    });
    if (!adj) return ctx.notFound('Adjustment not found');
    if (!RECOVERABLE.includes(adj.type)) {
      return ctx.badRequest(`Only an advance or loan is disbursed as cash — this is a "${adj.type}"`);
    }
    if (adj.status === 'Cancelled') return ctx.badRequest('A cancelled adjustment cannot be disbursed');

    const amount = Math.round((Number(adj.amount) || 0) * 100) / 100;
    if (amount <= 0) return ctx.badRequest('Adjustment amount must be positive');

    const method = body.method || adj.disbursement_method || 'Cash';
    if (!PAYOUT_METHOD_KEY[method]) {
      return ctx.badRequest(`method must be one of: ${Object.keys(PAYOUT_METHOD_KEY).join(', ')}`);
    }

    const accounting = strapi.service('api::acc-journal-entry.accounting');
    const resolver = strapi.service('api::acc-journal-entry.account-resolver');

    // Branch comes from the employee's payroll profile — the same source the
    // run uses for its accrual (`profile?.branch?.id`), so the disbursement
    // debit and the later recovery credit land on the same branch's accounts.
    let branchId = null;
    if (adj.employee?.documentId) {
      const profiles = await strapi.documents('api::pay-employee-profile.pay-employee-profile').findMany({
        filters: { employee: { documentId: adj.employee.documentId } },
        populate: { branch: { fields: ['id'] } },
        pagination: { pageSize: 1 },
      });
      branchId = profiles?.[0]?.branch?.id || null;
    }

    // Idempotency — if it is already posted, just make sure the stamp is there
    // rather than paying the employee twice on the books.
    const existing = await accounting.findBySource('Employee Advance', adj.id);
    if (existing && existing.length > 0) {
      const settled = await strapi.documents(ADJ_UID).update({
        documentId,
        data: { disbursed_at: adj.disbursed_at || new Date(), disbursement_method: method },
      });
      return ctx.send({ data: settled, meta: { alreadyPosted: true } });
    }

    const who = adj.employee?.name || '';
    try {
      await accounting.createAndPost({
        date: new Date(),
        description: `Employee ${adj.type}${who ? ' — ' + who : ''}`,
        source_type: 'Employee Advance',
        source_id: adj.id,
        source_ref: `ADJ-${adj.id}`,
        lines: [
          { account: await resolver.resolve('EMPLOYEE_ADVANCES', branchId), debit: amount, credit: 0, description: `${adj.type} recoverable from employee` },
          { account: await resolver.resolve(PAYOUT_METHOD_KEY[method], branchId), debit: 0, credit: amount, description: `Paid via ${method}` },
        ],
        branch: branchId,
        posted_by: user?.email || user?.username || '',
      });
    } catch (err) {
      strapi.log.warn(`[pay-adjustment/disburse] ${documentId} failed: ${err.message}`);
      return ctx.throw(err.status || 500, `Posting failed: ${err.message}`);
    }

    // Opening balance defaults to the full amount — the engine recovers against
    // `balance`, and an advance that was never disbursed has nothing to recover.
    const settled = await strapi.documents(ADJ_UID).update({
      documentId,
      data: {
        disbursed_at: new Date(),
        disbursement_method: method,
        ...(Number(adj.balance) > 0 ? {} : { balance: amount }),
      },
    });
    return ctx.send({ data: settled });
  },
}));
