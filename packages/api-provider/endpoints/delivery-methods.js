import { authApi } from '../lib/api.js';

export const DeliveryMethodsEndpoints = {
    list: ({ sort, populate, pagination } = {}) => ({
        path: '/delivery-methods',
        params: {
            sort: sort ?? ['priority:asc', 'createdAt:desc'],
            populate: populate ?? ['delivery_zones', 'product_groups'],
            pagination: pagination ?? { pageSize: 200 },
        },
    }),

    byId: (documentId, params = {}) => ({ path: `/delivery-methods/${documentId}`, params }),
    byIdDraft: (documentId, params = {}) => ({ path: `/delivery-methods/${documentId}`, params: { status: 'draft', ...params } }),
    byIdPublished: (documentId, params = {}) => ({ path: `/delivery-methods/${documentId}`, params: { status: 'published', ...params } }),
    create: () => ({ path: '/delivery-methods' }),
    update: (documentId) => ({ path: `/delivery-methods/${documentId}` }),

    fetchList: (opts = {}) => {
        const ep = DeliveryMethodsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchById: (documentId, params = {}) => authApi.fetch(`/delivery-methods/${documentId}`, params),
    fetchByIdDraft: (documentId, params = {}) => {
        const ep = DeliveryMethodsEndpoints.byIdDraft(documentId, params);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdPublished: (documentId, params = {}) => {
        const ep = DeliveryMethodsEndpoints.byIdPublished(documentId, params);
        return authApi.fetch(ep.path, ep.params);
    },
    postCreate: (data) => authApi.post('/delivery-methods', data),
    putUpdate: (documentId, data) => authApi.put(`/delivery-methods/${documentId}`, data),
    delById: (documentId) => authApi.del(`/delivery-methods/${documentId}`),
};
