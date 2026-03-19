'use strict';

module.exports = {
  async checkout(ctx) {
    const { id } = ctx.params;
    const { payments = [] } = ctx.request.body;

    const sale = await strapi.entityService.findOne(
      'api::sale.sale',
      id,
      {
        populate: {
          items: {
            populate: {
              items: true, // stock items
            },
          },
          payments: true,
          cash_register: true,
          branches: true,
        },
      }
    );

    if (!sale) return ctx.notFound('Sale not found');

    // 1. Validate
    for (const item of sale.items) {
      if (item.quantity !== item.items.length) {
        return ctx.badRequest(
          `SaleItem ${item.id} quantity mismatch`
        );
      }
    }

    // 2. Mark stock SOLD
    for (const item of sale.items) {
      for (const stock of item.items) {
        await strapi.entityService.update(
          'api::stock-item.stock-item',
          stock.id,
          {
            data: {
              status: 'Sold',
              sale_items: { connect: [item.id] },
            },
          }
        );
      }
    }

    // 3. Save new payments
    let newPaid = 0;
    for (const p of payments) {
      newPaid += Number(p.amount || 0);

      await strapi.entityService.create(
        'api::payment.payment',
        {
          data: {
            ...p,
            sale: sale.id,
            payment_date: new Date(),
            ...(sale.cash_register ? { cash_register: sale.cash_register.id } : {}),
          },
        }
      );
    }

    // 4. Account for previously recorded payments
    const previouslyPaid = (sale.payments || []).reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );
    const totalPaid = previouslyPaid + newPaid;

    // 5. Mark sale paid
    const paymentStatus = totalPaid >= sale.total ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';
    await strapi.entityService.update(
      'api::sale.sale',
      sale.id,
      {
        data: {
          payment_status: paymentStatus,
          ...(paymentStatus === 'Paid' ? { status: 'Completed' } : {}),
        },
      }
    );

    // 6. Create accounting journal entries
    try {
      const accounting = strapi.service('api::acc-journal-entry.accounting');
      const resolver = strapi.service('api::acc-journal-entry.account-resolver');

      // Determine branch id (sale.branches is manyToMany)
      const branchId = sale.branches && sale.branches.length > 0
        ? sale.branches[0].id
        : null;

      // --- 6a. Revenue journal entry ---
      // Debit each payment method account, Credit sales revenue (+ tax payable)
      const revenueLines = [];

      for (const p of payments) {
        const amt = Number(p.amount || 0);
        if (amt <= 0) continue;
        const paymentAccountId = await resolver.resolvePaymentMethod(
          p.payment_method || 'Cash',
          branchId
        );
        revenueLines.push({
          account: paymentAccountId,
          debit: amt,
          credit: 0,
          description: `Payment – ${p.payment_method || 'Cash'}`,
        });
      }

      // Credit: Sales Revenue for the net amount
      const taxAmount = Number(sale.tax || 0);
      const netRevenue = Number(sale.total || 0) - taxAmount;
      const revenueAccountId = await resolver.resolve('SALES_REVENUE', branchId);

      if (netRevenue > 0) {
        revenueLines.push({
          account: revenueAccountId,
          debit: 0,
          credit: netRevenue,
          description: 'Sales revenue',
        });
      }

      // Credit: Tax Payable (if any)
      if (taxAmount > 0) {
        const taxAccountId = await resolver.resolve('TAX_PAYABLE', branchId);
        revenueLines.push({
          account: taxAccountId,
          debit: 0,
          credit: taxAmount,
          description: 'Tax collected',
        });
      }

      if (revenueLines.length >= 2) {
        await accounting.createAndPost({
          date: sale.sale_date || new Date(),
          description: `POS Sale ${sale.invoice_no}`,
          source_type: 'POS Sale',
          source_id: sale.id,
          source_ref: sale.invoice_no,
          lines: revenueLines,
          branch: branchId,
          posted_by: ctx.state?.user?.email || '',
        });
      }

      // --- 6b. COGS journal entry ---
      // Debit COGS, Credit Inventory for total cost of sold items
      let totalCost = 0;
      for (const item of sale.items) {
        for (const stock of item.items) {
          totalCost += Number(stock.cost_price || 0);
        }
      }

      if (totalCost > 0) {
        const cogsAccountId = await resolver.resolve('COGS', branchId);
        const inventoryAccountId = await resolver.resolve('INVENTORY', branchId);

        await accounting.createAndPost({
          date: sale.sale_date || new Date(),
          description: `COGS for Sale ${sale.invoice_no}`,
          source_type: 'POS Sale',
          source_id: sale.id,
          source_ref: sale.invoice_no,
          lines: [
            {
              account: cogsAccountId,
              debit: totalCost,
              credit: 0,
              description: 'Cost of goods sold',
            },
            {
              account: inventoryAccountId,
              debit: 0,
              credit: totalCost,
              description: 'Inventory relieved',
            },
          ],
          branch: branchId,
          posted_by: ctx.state?.user?.email || '',
        });
      }
    } catch (accountingError) {
      // Log the error but don't fail the checkout — the sale is already committed.
      // Accounting entries can be reconciled manually if mappings are not configured yet.
      strapi.log.error(
        `Accounting entries failed for sale ${sale.id}: ${accountingError.message}`
      );
    }

    return { success: true };
  },
};
