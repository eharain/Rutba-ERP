import { authApi } from '../lib/api.js';

export const ProductGroupsEndpoints = {
    listDraft: ({ sort, populate, pagination } = {}) => ({
        path: '/product-groups',
        params: {
            status: 'draft',
            sort: sort ?? ['createdAt:desc'],
            populate: populate ?? ['gallery', 'cover_image', 'products'],
            pagination: pagination ?? { pageSize: 50 },
        },
    }),

    listPublished: ({ pageSize = 200 } = {}) => ({
        path: '/product-groups',
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/product-groups/${documentId}`,
        params: {
            status: 'draft',
            ...(populate ? { populate } : {}),
        },
    }),

    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/product-groups/${documentId}`,
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    create: () => ({ path: '/product-groups' }),
    updateDraft: (documentId) => ({ path: `/product-groups/${documentId}` }),
    publish: (documentId) => ({ path: `/product-groups/${documentId}/publish` }),
    unpublish: (documentId) => ({ path: `/product-groups/${documentId}/unpublish` }),
    del: (documentId) => ({ path: `/product-groups/${documentId}` }),

    fetchListDraft: (opts = {}) => {
        const ep = ProductGroupsEndpoints.listDraft(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchListPublished: (opts = {}) => {
        const ep = ProductGroupsEndpoints.listPublished(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdDraft: (documentId, opts = {}) => {
        const ep = ProductGroupsEndpoints.byIdDraft(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdPublished: (documentId, opts = {}) => {
        const ep = ProductGroupsEndpoints.byIdPublished(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    postCreate: (data) => authApi.post('/product-groups', { data }),
    putUpdateDraft: (documentId, data) => authApi.put(`/product-groups/${documentId}`, { data, status: 'draft' }),
    postPublish: (documentId) => authApi.post(`/product-groups/${documentId}/publish`, {}),
    postUnpublish: (documentId) => authApi.post(`/product-groups/${documentId}/unpublish`, {}),
    delById: (documentId) => authApi.del(`/product-groups/${documentId}`),
};
