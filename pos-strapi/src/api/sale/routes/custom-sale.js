module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/sales/:id/checkout',
      handler: 'sale.checkout',
    },
    {
      method: 'POST',
      path: '/sales/:id/record-payment',
      handler: 'record-payment.recordPayment',
    },
    {
      method: 'POST',
      path: '/sales/:id/pay-later/unlock',
      handler: 'sale.unlockPayLater',
    },
    {
      method: 'POST',
      path: '/sales/:id/pay-later',
      handler: 'sale.markPayLater',
    },
    {
      method: 'PUT',
      path: '/sales/:id/cancel',
      handler: 'cancel.cancel',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/sales/search-by-stock-item',
      handler: 'search-by-stock-item.searchByStockItem',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/sales/search-by-item-price',
      handler: 'search-by-item-price.searchByItemPrice',
      config: {
        auth: false,
      },
    },
  ],
};
