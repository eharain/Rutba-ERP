'use strict';

module.exports = {
  async beforeCreate(event) {
    //await allocateStock(event);
  },

  async beforeUpdate(event) {
   // await allocateStock(event);
  },
};

async function allocateStock(event) {
  const { data, where } = event.params;
  if (!data.quantity || !data.product) return;

  const saleItemId = where?.id;

  // Load existing sale item
  const existing = saleItemId
    ? await strapi.entityService.findOne(
        'api::sale-item.sale-item',
        saleItemId,
        { populate: { items: true } }
      )
    : null;

  const alreadyAllocated = existing?.items?.length || 0;
  const required = data.quantity - alreadyAllocated;

  if (required <= 0) return;

  // Fetch available stock
  const stockItems = await strapi.entityService.findMany(
    'api::stock-item.stock-item',
    {
      filters: {
        product: data.product,
        status: 'InStock',
      },
      limit: required,
    }
  );

  if (stockItems.length < required) {
    throw new Error('Insufficient stock');
  }

  for (const stock of stockItems) {
    await strapi.entityService.update(
      'api::stock-item.stock-item',
      stock.id,
      {
        data: {
          sale_item: saleItemId,
          status: 'Reserved',
        },
      }
    );
  }
}
