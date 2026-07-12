'use strict';

/**
 * checkout controller
 *
 * POST /sales/:id/checkout
 *
 * Server-side checkout for a POS sale. Records the payments passed in the body,
 * and — ONLY when the sale becomes fully paid — flips the sale's stock items to
 * Sold, marks the sale Completed, and posts the revenue/COGS journal entries.
 *
 * This path deliberately does NOT rewrite any sale-item / line data. It is used
 * to check out a locked "pay later" sale, whose line items and reserved stock
 * are frozen: the only thing checkout does is take money and, when settled,
 * release the reserved stock as Sold. A partial payment leaves the sale locked
 * and its stock untouched (e.g. still Reserved) so it can be settled later.
 *
 * Body: { payments: [{ payment_method, amount, transaction_no?, ... }] }
 */

// The generated client posts bodies wrapped as { data: {...} }; unwrap it so
// custom controllers can read fields directly (matches sale-order.readBody).
function readBody(ctx) {
  const b = ctx.request.body;
  if (b && typeof b === 'object' && b.data && typeof b.data === 'object' && !Array.isArray(b.data)) {
    return b.data;
  }
  return b || {};
}

module.exports = {
  async checkout(ctx) {
    const { id } = ctx.params;
    const { payments = [] } = readBody(ctx);

    const sale = await strapi.documents('api::sale.sale').findOne({
      documentId: id,
      populate: {
        items: {
          populate: {
            items: { fields: ['id', 'documentId', 'status', 'cost_price', 'sellable_units'] },
          },
        },
        payments: true,
        cash_register: true,
        branches: true,
      },
    });

    if (!sale) return ctx.notFound('Sale not found');
    if (sale.status === 'Cancelled') {
      return ctx.badRequest('Cannot check out a cancelled sale');
    }
    if (sale.status === 'Completed') {
      return ctx.badRequest('Sale is already completed');
    }

    const registerDocId = sale.cash_register?.documentId || sale.cash_register?.id;

    // 1. Record new payments
    let newPaid = 0;
    for (const p of payments) {
      const amt = Number(p.amount || 0);
      if (amt === 0) continue;
      newPaid += amt;
      await strapi.documents('api::payment.payment').create({
        data: {
          payment_method: p.payment_method,
          amount: amt,
          transaction_no: p.transaction_no || undefined,
          cash_received: p.cash_received,
          change: p.change,
          due: p.due,
          payment_date: new Date().toISOString(),
          sale: { connect: [id] },
          ...(registerDocId ? { cash_register: { connect: [String(registerDocId)] } } : {}),
        },
      });
    }

    // 2. Determine settlement status
    const previouslyPaid = (sale.payments || []).reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );
    const totalPaid = previouslyPaid + newPaid;
    const fullyPaid = totalPaid >= Number(sale.total || 0);
    const paymentStatus = fullyPaid ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';

    // 3. Only release stock + complete the sale once it's fully settled. A
    //    partial payment on a locked sale keeps the stock as-is (Reserved).
    if (fullyPaid) {
      for (const item of sale.items || []) {
        for (const stock of item.items || []) {
          if (!stock?.documentId || stock.status === 'Sold') continue;
          // Divisible rolls are consumed by the allocation engine (units_sold),
          // NOT by flipping the whole roll to Sold — a partially-sold roll must
          // stay InStock with its remaining sub-units. Skip them here (also
          // avoids the divisible whole-flip guard in the stock-item lifecycle).
          if ((Number(stock.sellable_units) || 1) > 1) continue;
          await strapi.documents('api::stock-item.stock-item').update({
            documentId: stock.documentId,
            data: {
              status: 'Sold',
              sale_items: { connect: [item.documentId] },
            },
          });
        }
      }
    }

    await strapi.documents('api::sale.sale').update({
      documentId: id,
      data: {
        payment_status: paymentStatus,
        ...(fullyPaid ? { status: 'Completed' } : {}),
      },
    });

    // 4. Accounting — post revenue + COGS only when the sale is settled.
    if (fullyPaid) {
      try {
        const accounting = strapi.service('api::acc-journal-entry.accounting');
        const resolver = strapi.service('api::acc-journal-entry.account-resolver');

        const branchId =
          sale.branches && sale.branches.length > 0 ? sale.branches[0].id : null;

        // 4a. Revenue: debit each payment method account, credit revenue (+ tax)
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

        // 4b. COGS: debit COGS, credit inventory for total cost of sold items.
        // Divisible lines sold N sub-units of a roll: pro-rate each allocation as
        // units × (roll cost_price / roll capacity), not the whole roll cost.
        let totalCost = 0;
        for (const item of sale.items || []) {
          const allocs = Array.isArray(item.allocations) ? item.allocations : [];
          if (allocs.length) {
            const byDoc = new Map((item.items || []).map((s) => [s.documentId, s]));
            const byId = new Map((item.items || []).map((s) => [s.id, s]));
            for (const a of allocs) {
              const units = Number(a.units) || 0;
              if (units <= 0) continue;
              const roll = (a.stock_item_id && byId.get(a.stock_item_id)) || (a.stock_item && byDoc.get(a.stock_item));
              const rollCost = Number(roll?.cost_price || 0);
              const cap = Number(roll?.sellable_units) || 1;
              if (rollCost > 0 && cap > 0) totalCost += units * (rollCost / cap);
            }
          } else {
            for (const stock of item.items || []) {
              totalCost += Number(stock.cost_price || 0);
            }
          }
        }
        totalCost = Math.round(totalCost * 100) / 100;
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
              { account: cogsAccountId, debit: totalCost, credit: 0, description: 'Cost of goods sold' },
              { account: inventoryAccountId, debit: 0, credit: totalCost, description: 'Inventory relieved' },
            ],
            branch: branchId,
            posted_by: ctx.state?.user?.email || '',
          });
        }
      } catch (accountingError) {
        // Sale is already committed — log and let accounting be reconciled later.
        strapi.log.error(
          `Accounting entries failed for sale ${sale.id}: ${accountingError.message}`
        );
      }
    }

    return ctx.send({ success: true, totalPaid, completed: fullyPaid });
  },
};
