export const WebOrdersEndpoints = {
    byId: (orderId, params = {}) => ({ path: `/web-orders/${orderId}`, params }),
};