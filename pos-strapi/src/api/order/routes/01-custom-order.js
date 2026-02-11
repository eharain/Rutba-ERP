/** @type {import('@strapi/strapi').Core.RouterConfig} */

const config = {
  type: 'content-api',
  routes: [
    // {
    //   method: 'POST',
    //   path: '/orders/checkout/count-price',
    //   handler: 'api::order.order.countPrice',
    // },
    {
      method: 'POST',
      path: '/orders/checkout/validate-address',
      handler: 'api::order.order.validateAddress',
    },
    // {
    //   method: 'POST',
    //   path: '/orders/checkout/shipping-rate',
    //   handler: 'api::order.order.shippingRate',
    // },
    // {
    //   method: 'POST',
    //   path: '/orders/checkout/webhook-stripe',
    //   handler: 'api::order.order.webhookStripe',
    // },
    // {
    //   method: 'GET',
    //   path: '/orders/transaction/:code',
    //   handler: 'api::order.order.getOrderWithCode',
    // },
    // {
    //   method: 'GET',
    //   path: '/orders/me/transaction',
    //   handler: 'api::order.order.getMyOrder',
    // },
    // {
    //   method: 'GET',
    //   path: '/orders/me/transaction/:code',
    //   handler: 'api::order.order.getOrderById',
    // },
  ]
};

module.exports = config;