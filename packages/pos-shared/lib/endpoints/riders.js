import { authApi } from '../api.js';

export const RidersEndpoints = {
    list: ({ sort, populate, pagination, fields } = {}) => ({
        path: '/riders',
        params: {
            sort: sort ?? ['createdAt:desc'],
            populate: populate ?? ['assigned_zones', 'user'],
            pagination: pagination ?? { pageSize: 200 },
            ...(fields ? { fields } : {}),
        },
    }),
    create: () => ({ path: '/riders' }),
    update: (documentId) => ({ path: `/riders/${documentId}` }),

    fetchList: (opts = {}) => {
        const ep = RidersEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    postCreate: (data) => authApi.post('/riders', data),
    putUpdate: (documentId, data) => authApi.put(`/riders/${documentId}`, data),
};
