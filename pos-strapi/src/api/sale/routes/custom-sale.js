module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/sales/:id/checkout',
      handler: 'checkout.checkout',
    },
    {
      method: 'POST',
      path: '/sales/:id/record-payment',
      handler: 'record-payment.recordPayment',
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
