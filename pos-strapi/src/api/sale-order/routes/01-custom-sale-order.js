/** @type {import('@strapi/strapi').Core.RouterConfig} */

const config = {
  type: 'content-api',
  routes: [
    // {
    //   method: 'POST',
    //   path: '/orders/checkout/count-price',
    //   handler: 'api::sale-order.sale-order.countPrice',
    // },
    {
      method: 'POST',
      path: '/orders/checkout/validate-address',
      handler: 'api::sale-order.sale-order.validateAddress',
    },
    {
      method: 'POST',
      path: '/sale-orders/checkout/validate-address',
      handler: 'api::sale-order.sale-order.validateAddress',
    },
    // {
    //   method: 'POST',
    //   path: '/orders/checkout/shipping-rate',
    //   handler: 'api::sale-order.sale-order.shippingRate',
    // },
    // {
    //   method: 'POST',
    //   path: '/orders/checkout/webhook-stripe',
    //   handler: 'api::sale-order.sale-order.webhookStripe',
    // },
    // {
    //   method: 'GET',
    //   path: '/orders/transaction/:code',
    //   handler: 'api::sale-order.sale-order.getOrderWithCode',
    // },
    // {
    //   method: 'GET',
    //   path: '/orders/me/transaction',
    //   handler: 'api::sale-order.sale-order.getMyOrder',
    // },
    // {
    //   method: 'GET',
    //   path: '/orders/me/transaction/:code',
    //   handler: 'api::sale-order.sale-order.getOrderById',
    // },

    // ── Web-user order routes (rutba_web_user only) ─────────
    {
      method: 'GET',
      path: '/web-orders',
      handler: 'api::sale-order.sale-order.myOrders',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/sale-orders',
      handler: 'api::sale-order.sale-order.myOrders',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/web-orders/:documentId',
      handler: 'api::sale-order.sale-order.myOrderDetail',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/sale-orders/:documentId',
      handler: 'api::sale-order.sale-order.myOrderDetail',
      config: { auth: false },
    },

    // ── Delivery method calculation ──────────────────────────
    {
      method: 'POST',
      path: '/orders/calculate-delivery',
      handler: 'api::sale-order.sale-order.calculateDelivery',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-orders/calculate-delivery',
      handler: 'api::sale-order.sale-order.calculateDelivery',
      config: { auth: false },
    },

    // ── Public order tracking (secret-based) ─────────────────
    {
      method: 'GET',
      path: '/orders/tracking/:documentId',
      handler: 'api::sale-order.sale-order.trackOrder',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/sale-orders/tracking/:documentId',
      handler: 'api::sale-order.sale-order.trackOrder',
      config: { auth: false },
    },

    // ── Order messages ────────────────────────────────────────
    {
      method: 'GET',
      path: '/orders/:documentId/messages',
      handler: 'api::sale-order.sale-order.getMessages',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/sale-orders/:documentId/messages',
      handler: 'api::sale-order.sale-order.getMessages',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/orders/:documentId/messages',
      handler: 'api::sale-order.sale-order.sendMessage',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-orders/:documentId/messages',
      handler: 'api::sale-order.sale-order.sendMessage',
      config: { auth: false },
    },

    // ── CMS order management ─────────────────────────────────
    {
      method: 'POST',
      path: '/orders/:documentId/update-status',
      handler: 'api::sale-order.sale-order.updateOrderStatus',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-orders/:documentId/update-status',
      handler: 'api::sale-order.sale-order.updateOrderStatus',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/orders/:documentId/assign-rider',
      handler: 'api::sale-order.sale-order.assignRider',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-orders/:documentId/assign-rider',
      handler: 'api::sale-order.sale-order.assignRider',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/orders/:documentId/cancel',
      handler: 'api::sale-order.sale-order.cancelOrder',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-orders/:documentId/cancel',
      handler: 'api::sale-order.sale-order.cancelOrder',
      config: { auth: false },
    },
  ]
};

module.exports = config;