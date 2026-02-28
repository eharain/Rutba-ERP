module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/sales/:id/checkout',
      handler: 'checkout.checkout',
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
