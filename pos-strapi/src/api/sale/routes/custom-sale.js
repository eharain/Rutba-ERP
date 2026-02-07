module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/sales/:id/checkout',
      handler: 'checkout.checkout',
    },
  ],
};
