'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const RM_UID = 'api::pay-statutory-remittance.pay-statutory-remittance';

const PAYOUT_METHOD_KEY = { Cash: 'CASH_DRAWER', Bank: 'BANK_PRIMARY', 'Mobile Wallet': 'MOBILE_WALLET' };

async function getAuthUser(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: {
      role: { select: ['type'] },
      permission_roles: { select: ['level'], populate: { domain: { select: ['key'] } } },
    },
  });
}

function isPayrollManager(user) {
  if (user?.role?.type === 'admin') return true;
  const domains = (user?.permission_roles || [])
    .filter((r) => r?.level === 'admin' || r?.level === 'manager')
    .map((r) => r?.domain?.key)
    .filter(Boolean);
  return domains.includes('payroll') || domains.includes('accounts') || domains.includes('auth');
}

module.exports = createCoreController(RM_UID, ({ strapi }) => ({
  /**
   * Post the remittance to the GL: debit the statutory liability account,
   * credit cash/bank, and mark the remittance Paid. Idempotent + manager-gated.
   */
  async process(ctx) {
    const user = await getAuthUser(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');
    if (!isPayrollManager(user)) return ctx.forbidden('Payroll access is required');

    const { documentId } = ctx.params;
    const rm = await strapi.documents(RM_UID).findOne({ documentId, populate: { branch: { fields: ['id'] } } });
    if (!rm) return ctx.notFound('Remittance not found');
    if (rm.status === 'Paid') return ctx.send({ data: rm });
    if (rm.status === 'Cancelled') return ctx.badRequest('A cancelled remittance cannot be posted');

    const amount = Math.round((Number(rm.amount) || 0) * 100) / 100;
    if (amount <= 0) return ctx.badRequest('Remittance amount must be positive');

    const accounting = strapi.service('api::acc-journal-entry.accounting');
    const resolver = strapi.service('api::acc-journal-entry.account-resolver');
    const branchId = rm.branch?.id || null;

    // Idempotency — if a journal entry already exists for this remittance, just
    // settle the status rather than double-posting.
    const existing = await accounting.findBySource('Statutory Remittance', rm.id);
    if (existing && existing.length > 0) {
      const settled = await strapi.documents(RM_UID).update({
        documentId, data: { status: 'Paid', paid_at: rm.paid_at || new Date() },
      });
      return ctx.send({ data: settled });
    }

    const cashKey = PAYOUT_METHOD_KEY[rm.method] || 'BANK_PRIMARY';
    try {
      await accounting.createAndPost({
        date: new Date(),
        description: `Statutory remittance${rm.authority ? ' — ' + rm.authority : ''}${rm.period_label ? ' (' + rm.period_label + ')' : ''}`,
        source_type: 'Statutory Remittance',
        source_id: rm.id,
        source_ref: rm.reference || `RM-${rm.id}`,
        lines: [
          { account: await resolver.resolve(rm.gl_account_key || 'STATUTORY_PAYABLE', branchId), debit: amount, credit: 0, description: 'Statutory liability settled' },
          { account: await resolver.resolve(cashKey, branchId), debit: 0, credit: amount, description: `Paid via ${rm.method || 'Bank'}` },
        ],
        branch: branchId,
        posted_by: user?.email || user?.username || '',
      });
    } catch (err) {
      strapi.log.warn(`[pay-statutory-remittance/process] ${documentId} failed: ${err.message}`);
      return ctx.throw(err.status || 500, `Posting failed: ${err.message}`);
    }

    const settled = await strapi.documents(RM_UID).update({
      documentId, data: { status: 'Paid', paid_at: new Date() },
    });
    return ctx.send({ data: settled });
  },
}));
