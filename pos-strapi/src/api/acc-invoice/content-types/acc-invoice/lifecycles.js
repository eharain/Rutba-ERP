'use strict';

/**
 * Invoice Lifecycles (Accounts Receivable)
 *
 * Workflow:
 *   Draft  → Sent       – AR clerk sends the invoice (no JE yet)
 *   Sent   → Paid       – AR clerk records payment received
 *                          → auto-creates a JE:
 *                            Debit  Cash/Bank (payment method)
 *                            Credit Accounts Receivable
 *   Sent   → Partially Paid – partial payment received
 *                          → auto-creates a JE for the partial amount
 *   Any    → Cancelled  – reverses any existing JE
 *
 * The journal entries created at "Sent" stage (when invoice is issued):
 *   Debit  Accounts Receivable
 *   Credit Sales Revenue (+ Tax Payable if tax_amount > 0)
 */

module.exports = {
  async afterUpdate(event) {
    const { result, params } = event;
    const newStatus = result.status;

    // We only act on status transitions
    if (!newStatus) return;

    // Retrieve the previous state from event.state (set in beforeUpdate)
    const previousStatus = event.state?.previousStatus;
    if (!previousStatus || previousStatus === newStatus) return;

    try {
      const accounting = strapi.service('api::acc-journal-entry.accounting');
      const resolver = strapi.service('api::acc-journal-entry.account-resolver');
      const branchId = result.branch?.id || result.branch || null;

      // ── Invoice issued (Draft → Sent) ──────────────────────
      if (previousStatus === 'Draft' && newStatus === 'Sent') {
        const subtotal = Number(result.subtotal || 0);
        const taxAmount = Number(result.tax_amount || 0);
        const total = Number(result.total || subtotal + taxAmount);

        if (total <= 0) return;

        const arAccountId = await resolver.resolve('ACCOUNTS_RECEIVABLE', branchId);
        const revenueAccountId = await resolver.resolve('SALES_REVENUE', branchId);

        const lines = [
          {
            account: arAccountId,
            debit: total,
            credit: 0,
            description: `Invoice ${result.invoice_number} — receivable`,
          },
          {
            account: revenueAccountId,
            debit: 0,
            credit: subtotal,
            description: `Invoice ${result.invoice_number} — revenue`,
          },
        ];

        if (taxAmount > 0) {
          const taxAccountId = await resolver.resolve('TAX_PAYABLE', branchId);
          lines.push({
            account: taxAccountId,
            debit: 0,
            credit: taxAmount,
            description: `Invoice ${result.invoice_number} — tax`,
          });
        }

        const entry = await accounting.createAndPost({
          date: result.date || new Date(),
          description: `Invoice issued: ${result.invoice_number}`,
          source_type: 'Invoice Payment',
          source_id: result.id,
          source_ref: result.invoice_number,
          lines,
          branch: branchId,
        });

        // Link JE back to invoice
        await strapi.entityService.update(
          'api::acc-invoice.acc-invoice',
          result.id,
          { data: { journal_entry: entry.id } }
        );
      }

      // ── Payment received (Sent/Partially Paid → Paid/Partially Paid)
      if (
        (previousStatus === 'Sent' || previousStatus === 'Partially Paid') &&
        (newStatus === 'Paid' || newStatus === 'Partially Paid')
      ) {
        const amountPaid = Number(result.amount_paid || 0);
        const previousPaid = event.state?.previousAmountPaid || 0;
        const paymentAmount = amountPaid - previousPaid;

        if (paymentAmount <= 0) return;

        const arAccountId = await resolver.resolve('ACCOUNTS_RECEIVABLE', branchId);
        // Default to bank for invoice payments
        const bankAccountId = await resolver.resolve('BANK_PRIMARY', branchId);

        await accounting.createAndPost({
          date: new Date(),
          description: `Payment received: ${result.invoice_number}`,
          source_type: 'Invoice Payment',
          source_id: result.id,
          source_ref: result.invoice_number,
          lines: [
            {
              account: bankAccountId,
              debit: paymentAmount,
              credit: 0,
              description: `Payment for invoice ${result.invoice_number}`,
            },
            {
              account: arAccountId,
              debit: 0,
              credit: paymentAmount,
              description: `Reduce receivable — invoice ${result.invoice_number}`,
            },
          ],
          branch: branchId,
        });
      }

      // ── Cancelled — reverse all JEs ────────────────────────
      if (newStatus === 'Cancelled' && previousStatus !== 'Cancelled') {
        await accounting.reverseBySource('Invoice Payment', result.id);
      }
    } catch (err) {
      strapi.log.error(
        `[acc-invoice lifecycle] Accounting failed for invoice ${result.id}: ${err.message}`
      );
    }
  },

  async beforeUpdate(event) {
    const { where } = event.params;
    const id = where?.id || where;
    if (!id) return;

    // Capture previous state for comparison in afterUpdate
    const existing = await strapi.entityService.findOne(
      'api::acc-invoice.acc-invoice',
      id,
      { fields: ['status', 'amount_paid'] }
    );

    event.state = {
      previousStatus: existing?.status || null,
      previousAmountPaid: Number(existing?.amount_paid || 0),
    };
  },
};
