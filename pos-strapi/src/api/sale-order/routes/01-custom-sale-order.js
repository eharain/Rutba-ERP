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

    // ── Web checkout create order (public + authenticated) ──
    {
      method: 'POST',
      path: '/orders',
      handler: 'api::sale-order.sale-order.create',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-orders',
      handler: 'api::sale-order.sale-order.create',
      config: { auth: false },
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
    // Fulfillment — bind a specific stock-item to an order line. auth:false
    // because the controller's requireStaffUser gate guards this; matches
    // the convention used by update-status / assign-rider above.
    {
      method: 'POST',
      path: '/orders/:documentId/attach-stock-item',
      handler: 'api::sale-order.sale-order.attachStockItem',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-orders/:documentId/attach-stock-item',
      handler: 'api::sale-order.sale-order.attachStockItem',
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

    // ── Payment collection + verification (CMS / rider / accounts) ───
    // `auth: false` keeps the route past Strapi's scope check; the handler
    // runs ensureUser + requireStaffUser internally. Same pattern as
    // update-status and assign-rider.
    {
      method: 'POST',
      path: '/orders/:documentId/record-payment',
      handler: 'api::sale-order.sale-order.recordPayment',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-orders/:documentId/record-payment',
      handler: 'api::sale-order.sale-order.recordPayment',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/orders/:documentId/verify-payment',
      handler: 'api::sale-order.sale-order.verifyPayment',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-orders/:documentId/verify-payment',
      handler: 'api::sale-order.sale-order.verifyPayment',
      config: { auth: false },
    },

    // ── Cost-change approval (customer email round-trip) ────────────────
    //
    // Public confirm route MUST be declared before the other two because
    // its path is literal (`/confirm-change`), not param-bound — per
    // feedback_koa_router_literal_prefix_order. Otherwise the
    // `/:documentId/...` routes shadow it.
    //
    // confirm-change auth:false — the token IS the auth. The other two
    // run requireStaffUser inside the controller (same pattern as the rest
    // of this file).
    {
      method: 'POST',
      path: '/sale-orders/confirm-change',
      handler: 'api::sale-order.sale-order.confirmCostChange',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/sale-orders/confirm-change',
      handler: 'api::sale-order.sale-order.confirmCostChange',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-orders/:documentId/request-cost-change-ack',
      handler: 'api::sale-order.sale-order.requestCostChangeAck',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-orders/:documentId/override-cost-change-ack',
      handler: 'api::sale-order.sale-order.overrideCostChangeAck',
      config: { auth: false },
    },

    // ── Provider-specific label generation ───────────────────────────────
    // Literal `/label` and `/return-label` segments must register before the
    // core /sale-orders/:documentId router catches them per
    // feedback_koa_router_literal_prefix_order. auth:false because the
    // controller runs requireStaffUser internally.
    {
      method: 'GET',
      path: '/sale-orders/:documentId/label',
      handler: 'api::sale-order.sale-order.getLabel',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/sale-orders/:documentId/return-label',
      handler: 'api::sale-order.sale-order.getReturnLabel',
      config: { auth: false },
    },
  ]
};

module.exports = config;