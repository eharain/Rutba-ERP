export const WebDeliveryEndpoints = {
  calculateMethods: (data) => ({
    path: 'orders/calculate-delivery',
    method: 'post',
    data,
  }),
  getMessages: (documentId) => ({
    path: `orders/${documentId}/messages`,
    method: 'get',
  }),
  sendMessage: (documentId, data) => ({
    path: `orders/${documentId}/messages`,
    method: 'post',
    data,
  }),
  tracking: (documentId, secret) => ({
    path: `orders/tracking/${documentId}`,
    method: 'get',
    params: { secret },
  }),
};
