import { authApi } from '../api.js';

export const WebOrdersEndpoints = {
    byId: (orderId, params = {}) => ({ path: `/web-orders/${orderId}`, params }),
    fetchById: (orderId, params = {}, jwt) => authApi.get(`/web-orders/${orderId}`, params, jwt),
};
