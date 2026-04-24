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

    // ── Web-user order routes (rutba_web_user only) ─────────
    {
      method: 'GET',
      path: '/web-orders',
      handler: 'api::order.order.myOrders',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/web-orders/:documentId',
      handler: 'api::order.order.myOrderDetail',
      config: { auth: false },
    },

    // ── Delivery method calculation ──────────────────────────
    {
      method: 'POST',
      path: '/orders/calculate-delivery',
      handler: 'api::order.order.calculateDelivery',
      config: { auth: false },
    },

    // ── Public order tracking (secret-based) ─────────────────
    {
      method: 'GET',
      path: '/orders/tracking/:documentId',
      handler: 'api::order.order.trackOrder',
      config: { auth: false },
    },

    // ── Order messages ────────────────────────────────────────
    {
      method: 'GET',
      path: '/orders/:documentId/messages',
      handler: 'api::order.order.getMessages',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/orders/:documentId/messages',
      handler: 'api::order.order.sendMessage',
      config: { auth: false },
    },

    // ── CMS order management ─────────────────────────────────
    {
      method: 'POST',
      path: '/orders/:documentId/update-status',
      handler: 'api::order.order.updateOrderStatus',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/orders/:documentId/assign-rider',
      handler: 'api::order.order.assignRider',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/orders/:documentId/cancel',
      handler: 'api::order.order.cancelOrder',
      config: { auth: false },
    },
  ]
};

module.exports = config;