import { authApi } from '../lib/api.js';

export const SaleOffersEndpoints = {
    listDraft: ({ sort, populate, pagination } = {}) => ({
        path: '/sale-offers',
        params: {
            status: 'draft',
            sort: sort ?? ['createdAt:desc'],
            populate: populate ?? ['product_groups', 'cms_pages', 'categories'],
            pagination: pagination ?? { pageSize: 50 },
        },
    }),

    listPublished: ({ pageSize = 200 } = {}) => ({
        path: '/sale-offers',
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/sale-offers/${documentId}`,
        params: {
            status: 'draft',
            ...(populate ? { populate } : {}),
        },
    }),

    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/sale-offers/${documentId}`,
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    create: () => ({ path: '/sale-offers' }),
    updateDraft: (documentId) => ({ path: `/sale-offers/${documentId}` }),
    publish: (documentId) => ({ path: `/sale-offers/${documentId}/publish` }),
    unpublish: (documentId) => ({ path: `/sale-offers/${documentId}/unpublish` }),
    del: (documentId) => ({ path: `/sale-offers/${documentId}` }),

    fetchListDraft: (opts = {}) => {
        const ep = SaleOffersEndpoints.listDraft(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchListPublished: (opts = {}) => {
        const ep = SaleOffersEndpoints.listPublished(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdDraft: (documentId, opts = {}) => {
        const ep = SaleOffersEndpoints.byIdDraft(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdPublished: (documentId, opts = {}) => {
        const ep = SaleOffersEndpoints.byIdPublished(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    postCreate: (data) => authApi.post('/sale-offers', { data }),
    putUpdateDraft: (documentId, data) => authApi.put(`/sale-offers/${documentId}`, { data, status: 'draft' }),
    postPublish: (documentId) => authApi.post(`/sale-offers/${documentId}/publish`, {}),
    postUnpublish: (documentId) => authApi.post(`/sale-offers/${documentId}/unpublish`, {}),
    delById: (documentId) => authApi.del(`/sale-offers/${documentId}`),
};
