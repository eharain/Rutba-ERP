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
          cash_register: true,
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

    // 3. Save payments
    let paid = 0;
    for (const p of payments) {
      paid += Number(p.amount || 0);

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

    // 4. Mark sale paid
    const paymentStatus = paid >= sale.total ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid';
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

    return { success: true };
  },
};
