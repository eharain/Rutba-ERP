'use strict';

/**
 * Cash register transaction accounting lifecycle.
 *
 * Posts the drawer cash movements that are NOT booked elsewhere:
 *   CashDrop  → Dr Cash Safe   / Cr Cash Drawer
 *   CashTopUp → Dr Cash Drawer / Cr Cash Safe
 *   Expense   → Dr Operating Expenses / Cr Cash Drawer
 *
 * 'Refund' is skipped — the cash refund is booked by the sale-return lifecycle.
 * 'Adjustment' is skipped — it is a reconciliation marker whose cash effect is
 * already captured by the underlying event (e.g. a sale-cancellation reversal),
 * and the register close books any residual variance to Cash Short/Over.
 *
 * Keyed source_type 'Cash Register Transaction' + the txn id (idempotent).
 */

const POSTABLE = ['CashDrop', 'CashTopUp', 'Expense'];

module.exports = {
  async afterCreate(event) {
    const { result } = event;
    const type = result?.type;
    const amt = Math.abs(Number(result?.amount || 0));
    if (!POSTABLE.includes(type) || amt === 0) return;

    try {
      const accounting = strapi.service('api::acc-journal-entry.accounting');
      const resolver = strapi.service('api::acc-journal-entry.account-resolver');

      const already = await accounting.findBySource('Cash Register Transaction', result.id);
      if (already && already.length > 0) return;

      let lines;
      if (type === 'CashDrop') {
        lines = [
          { account: await resolver.resolve('CASH_SAFE', null), debit: amt, credit: 0, description: 'Cash drop to safe' },
          { account: await resolver.resolve('CASH_DRAWER', null), debit: 0, credit: amt, description: 'From drawer' },
        ];
      } else if (type === 'CashTopUp') {
        lines = [
          { account: await resolver.resolve('CASH_DRAWER', null), debit: amt, credit: 0, description: 'Cash top-up to drawer' },
          { account: await resolver.resolve('CASH_SAFE', null), debit: 0, credit: amt, description: 'From safe' },
        ];
      } else { // Expense
        lines = [
          { account: await resolver.resolve('OPERATING_EXPENSES', null), debit: amt, credit: 0, description: result.description || 'Drawer expense' },
          { account: await resolver.resolve('CASH_DRAWER', null), debit: 0, credit: amt, description: 'Paid from drawer' },
        ];
      }

      await accounting.createAndPost({
        date: result.transaction_date || new Date(),
        description: `Register ${type}${result.description ? ' — ' + result.description : ''}`,
        source_type: 'Cash Register Transaction',
        source_id: result.id,
        source_ref: `CRT-${result.id}`,
        lines,
        posted_by: result.performed_by || '',
      });
    } catch (err) {
      strapi.log.error(`[cash-register-transaction lifecycle] accounting failed for ${result.id}: ${err.message}`);
    }
  },
};
