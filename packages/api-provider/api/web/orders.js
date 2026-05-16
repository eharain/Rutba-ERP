export const WebOrdersEndpoints = {
  myOrders: () => ({
    path: '/sale-orders',
    method: 'get',
    params: {
      populate: {
        customer_person: true,
        delivery_address: true,
        products: {
          populate: {
            items: {
              fields: ['quantity', 'product_name', 'variant', 'variant_name', 'variant_terms'],
              populate: { image: true },
            },
          },
        },
      },
      sort: ['createdAt:desc'],
    },
  }),

  byId: (documentId) => ({
    path: `/sale-orders/${documentId}`,
    method: 'get',
    params: {
      populate: {
        customer_person: true,
        delivery_address: true,
        products: { populate: { items: { populate: { image: true } } } },
      },
    },
  }),

  create: (data) => ({
    path: '/orders',
    method: 'post',
    data,
  }),

  validateAddress: (data) => ({
    path: '/orders/checkout/validate-address',
    method: 'post',
    data,
  }),

  shippingRate: (data) => ({
    path: '/orders/checkout/shipping-rate',
    method: 'post',
    data,
  }),

  calculateDelivery: (data) => ({
    path: '/orders/calculate-delivery',
    method: 'post',
    data,
  }),

  tracking: (documentId, secret) => ({
    path: `/orders/tracking/${documentId}`,
    method: 'get',
    params: { secret },
  }),

  messages: (documentId) => ({
    path: `/orders/${documentId}/messages`,
    method: 'get',
  }),

  sendMessage: (documentId, data) => ({
    path: `/orders/${documentId}/messages`,
    method: 'post',
    data,
  }),
};
