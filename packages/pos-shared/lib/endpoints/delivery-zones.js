import { authApi } from '../api.js';

export const DeliveryZonesEndpoints = {
    list: ({ sort, pagination } = {}) => ({
        path: '/delivery-zones',
        params: {
            sort: sort ?? ['createdAt:desc'],
            pagination: pagination ?? { pageSize: 200 },
        },
    }),
    create: () => ({ path: '/delivery-zones' }),

    fetchList: (opts = {}) => {
        const ep = DeliveryZonesEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    postCreate: (data) => authApi.post('/delivery-zones', data),
};
