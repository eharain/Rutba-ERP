'use strict';

/**
 * Bill Lifecycles (Accounts Payable)
 *
 * Workflow:
 *   Draft    → Received        – AP clerk records the bill from supplier
 *                                 → auto-creates a JE:
 *                                   Debit  Expense / Inventory account
 *                                   Credit Accounts Payable
 *   Received → Paid            – AP clerk records payment made
 *                                 → auto-creates a JE:
 *                                   Debit  Accounts Payable
 *                                   Credit Cash / Bank
 *   Received → Partially Paid  – partial payment made
 *                                 → auto-creates a JE for the partial amount
 *   Any      → Cancelled       – reverses any existing JE
 */

module.exports = {
  async afterUpdate(event) {
    const { result, params } = event;
    const newStatus = result.status;

    if (!newStatus) return;

    const previousStatus = event.state?.previousStatus;
    if (!previousStatus || previousStatus === newStatus) return;

    try {
      const accounting = strapi.service('api::acc-journal-entry.accounting');
      const resolver = strapi.service('api::acc-journal-entry.account-resolver');
      const branchId = result.branch?.id || result.branch || null;

      // ── Bill received (Draft → Received) ───────────────────
      if (previousStatus === 'Draft' && newStatus === 'Received') {
        const subtotal = Number(result.subtotal || 0);
        const taxAmount = Number(result.tax_amount || 0);
        const total = Number(result.total || subtotal + taxAmount);

        if (total <= 0) return;

        const apAccountId = await resolver.resolve('ACCOUNTS_PAYABLE', branchId);
        // Default: bill represents an operating expense
        // (Inventory bills would use INVENTORY key — can be extended)
        const expenseAccountId = await resolver.resolve('OPERATING_EXPENSES', branchId);

        const lines = [
          {
            account: expenseAccountId,
            debit: subtotal,
            credit: 0,
            description: `Bill ${result.bill_number} — expense`,
          },
        ];

        if (taxAmount > 0) {
          // Tax on purchases is typically a receivable (input tax)
          // but for simplicity we use the same TAX_PAYABLE account
          // (net effect reduces the payable).
          lines.push({
            account: expenseAccountId,
            debit: taxAmount,
            credit: 0,
            description: `Bill ${result.bill_number} — tax on purchase`,
          });
        }

        lines.push({
          account: apAccountId,
          debit: 0,
          credit: total,
          description: `Bill ${result.bill_number} — payable`,
        });

        const entry = await accounting.createAndPost({
          date: result.date || new Date(),
          description: `Bill received: ${result.bill_number}`,
          source_type: 'Bill Payment',
          source_id: result.id,
          source_ref: result.bill_number,
          lines,
          branch: branchId,
        });

        // Link JE back to bill
        await strapi.entityService.update(
          'api::acc-bill.acc-bill',
          result.id,
          { data: { journal_entry: entry.id } }
        );
      }

      // ── Payment made (Received/Partially Paid → Paid/Partially Paid)
      if (
        (previousStatus === 'Received' || previousStatus === 'Partially Paid') &&
        (newStatus === 'Paid' || newStatus === 'Partially Paid')
      ) {
        const amountPaid = Number(result.amount_paid || 0);
        const previousPaid = event.state?.previousAmountPaid || 0;
        const paymentAmount = amountPaid - previousPaid;

        if (paymentAmount <= 0) return;

        const apAccountId = await resolver.resolve('ACCOUNTS_PAYABLE', branchId);
        const bankAccountId = await resolver.resolve('BANK_PRIMARY', branchId);

        await accounting.createAndPost({
          date: new Date(),
          description: `Bill payment: ${result.bill_number}`,
          source_type: 'Bill Payment',
          source_id: result.id,
          source_ref: result.bill_number,
          lines: [
            {
              account: apAccountId,
              debit: paymentAmount,
              credit: 0,
              description: `Pay bill ${result.bill_number}`,
            },
            {
              account: bankAccountId,
              debit: 0,
              credit: paymentAmount,
              description: `Cash out — bill ${result.bill_number}`,
            },
          ],
          branch: branchId,
        });
      }

      // ── Cancelled — reverse all JEs ────────────────────────
      if (newStatus === 'Cancelled' && previousStatus !== 'Cancelled') {
        await accounting.reverseBySource('Bill Payment', result.id);
      }
    } catch (err) {
      strapi.log.error(
        `[acc-bill lifecycle] Accounting failed for bill ${result.id}: ${err.message}`
      );
    }
  },

  async beforeUpdate(event) {
    const { where } = event.params;
    const id = where?.id || where;
    if (!id) return;

    const existing = await strapi.entityService.findOne(
      'api::acc-bill.acc-bill',
      id,
      { fields: ['status', 'amount_paid'] }
    );

    event.state = {
      previousStatus: existing?.status || null,
      previousAmountPaid: Number(existing?.amount_paid || 0),
    };
  },
};
