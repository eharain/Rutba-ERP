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
              sale_item: item.id,
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
          },
        }
      );
    }

    // 4. Mark sale paid
    await strapi.entityService.update(
      'api::sale.sale',
      sale.id,
      {
        data: {
          payment_status:
            paid >= sale.total ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid',
        },
      }
    );

    return { success: true };
  },
};
