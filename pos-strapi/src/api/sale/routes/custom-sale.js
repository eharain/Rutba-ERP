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
  ],
};
