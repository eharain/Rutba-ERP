'use strict';

/**
 * record-payment controller
 *
 * POST /sales/:id/record-payment
 *
 * Records one or more payments against a sale WITHOUT completing it.
 * The sale stays in its current status (e.g. Draft) so it can be
 * checked out later.  The payment_status is updated to reflect the
 * running total paid vs the sale total.
 *
 * Body: { payments: [{ payment_method, amount, transaction_no?, ... }] }
 */

module.exports = {
  async recordPayment(ctx) {
    const { id } = ctx.params;
    const { payments = [] } = ctx.request.body;

    if (!payments.length) {
      return ctx.badRequest('At least one payment is required');
    }

    // ── Load the sale with existing payments & cash register ──
    const sale = await strapi.documents('api::sale.sale').findOne({
      documentId: id,
      populate: {
        payments: true,
        cash_register: true,
      },
    });

    if (!sale) return ctx.notFound('Sale not found');

    if (sale.status === 'Cancelled') {
      return ctx.badRequest('Cannot record payments on a cancelled sale');
    }

    if (sale.status === 'Completed') {
      return ctx.badRequest('Sale is already completed');
    }

    const registerDocId =
      sale.cash_register?.documentId || sale.cash_register?.id;

    // ── Sum previously recorded payments ──
    let previouslyPaid = (sale.payments || []).reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    // ── Create new payment records ──
    let newPaid = 0;
    for (const p of payments) {
      const amt = Number(p.amount || 0);
      if (amt === 0) continue;

      newPaid += amt;

      await strapi.documents('api::payment.payment').create({
        data: {
          ...p,
          amount: amt,
          payment_date: new Date().toISOString(),
          sale: { connect: [id] },
          ...(registerDocId
            ? { cash_register: { connect: [String(registerDocId)] } }
            : {}),
        },
      });
    }

    // ── Update payment_status on the sale ──
    const totalPaid = previouslyPaid + newPaid;
    const paymentStatus =
      totalPaid >= sale.total ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';

    const updated = await strapi.documents('api::sale.sale').update({
      documentId: id,
      data: {
        payment_status: paymentStatus,
      },
    });

    return ctx.send({ data: updated, totalPaid, remaining: sale.total - totalPaid });
  },
};
