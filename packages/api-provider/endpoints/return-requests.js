import { authApi } from '../lib/api.js';

export const ReturnRequestsEndpoints = {
    create: () => ({ path: '/return-requests' }),
    postCreate: (data, jwt) => authApi.post('/return-requests', data, jwt),
};
