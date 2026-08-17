'use strict';

/**
 * Expense Lifecycles
 *
 * Workflow:
 *   Draft    → Approved   – Manager approves (no JE yet)
 *   Approved → Posted     – Accountant posts
 *                           → auto-creates a JE:
 *                             Debit  Expense account (or OPERATING_EXPENSES fallback)
 *                             Credit Cash / Bank (based on payment_method)
 *   Any      → Cancelled  – reverses any existing JE
 */

module.exports = {
  async afterUpdate(event) {
    const { result } = event;
    const newStatus = result.status;
    if (!newStatus) return;

    const previousStatus = event.state?.previousStatus;
    if (!previousStatus || previousStatus === newStatus) return;

    try {
      const accounting = strapi.service('api::acc-journal-entry.accounting');
      const resolver = strapi.service('api::acc-journal-entry.account-resolver');
      const branchId = result.branch?.id || result.branch || null;

      // ── Posted (Approved → Posted) ─────────────────────────
      if (previousStatus === 'Approved' && newStatus === 'Posted') {
        const amount = Number(result.amount || 0);
        if (amount <= 0) return;

        // Expense account — use the linked account if set, otherwise fallback
        let expenseAccountId = result.account?.id || result.account || null;
        if (!expenseAccountId) {
          expenseAccountId = await resolver.resolve('OPERATING_EXPENSES', branchId);
        }

        // Payment method → credit account
        const pmMethodMap = {
          'Cash': 'CASH_DRAWER',
          'Card': 'CARD_CLEARING',
          'Bank Transfer': 'BANK_PRIMARY',
          'Mobile Wallet': 'MOBILE_WALLET',
          'Other': 'CASH_DRAWER',
        };
        const creditKey = pmMethodMap[result.payment_method] || 'CASH_DRAWER';
        const creditAccountId = await resolver.resolve(creditKey, branchId);

        const entry = await accounting.createAndPost({
          date: result.date || new Date(),
          description: `Expense: ${result.description || result.category || 'General'}`,
          source_type: 'Expense',
          source_id: result.id,
          source_ref: `EXP-${result.id}`,
          lines: [
            {
              account: expenseAccountId,
              debit: amount,
              credit: 0,
              description: result.description || result.category || 'Expense',
            },
            {
              account: creditAccountId,
              debit: 0,
              credit: amount,
              description: `Paid via ${result.payment_method || 'Cash'}`,
            },
          ],
          branch: branchId,
        });

        // Link JE back to expense
        await strapi.entityService.update(
          'api::acc-expense.acc-expense',
          result.id,
          { data: { journal_entry: entry.id } }
        );
      }

      // ── Cancelled — reverse all JEs ────────────────────────
      if (newStatus === 'Cancelled' && previousStatus !== 'Cancelled') {
        await accounting.reverseBySource('Expense', result.id);
      }
    } catch (err) {
      strapi.log.error(
        `[acc-expense lifecycle] Accounting failed for expense ${result.id}: ${err.message}`
      );
    }
  },

  async beforeUpdate(event) {
    const { where } = event.params;
    const id = where?.id || where;
    if (!id) return;

    const existing = await strapi.entityService.findOne(
      'api::acc-expense.acc-expense',
      id,
      { fields: ['status'], populate: { account: { fields: ['id'] } } }
    );

    event.state = {
      previousStatus: existing?.status || null,
    };
  },
};
