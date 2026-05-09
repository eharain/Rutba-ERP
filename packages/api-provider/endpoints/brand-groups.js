import { authApi } from '../lib/api.js';

export const BrandGroupsEndpoints = {
    listDraft: ({ sort, populate, pagination } = {}) => ({
        path: '/brand-groups',
        params: {
            status: 'draft',
            sort: sort ?? ['sort_order:asc', 'createdAt:desc'],
            populate: populate ?? ['brands'],
            pagination: pagination ?? { pageSize: 50 },
        },
    }),

    listPublished: ({ pageSize = 200 } = {}) => ({
        path: '/brand-groups',
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/brand-groups/${documentId}`,
        params: {
            status: 'draft',
            ...(populate ? { populate } : {}),
        },
    }),

    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/brand-groups/${documentId}`,
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    create: () => ({ path: '/brand-groups' }),
    updateDraft: (documentId) => ({ path: `/brand-groups/${documentId}` }),
    publish: (documentId) => ({ path: `/brand-groups/${documentId}/publish` }),
    unpublish: (documentId) => ({ path: `/brand-groups/${documentId}/unpublish` }),
    del: (documentId) => ({ path: `/brand-groups/${documentId}` }),

    fetchListDraft: (opts = {}) => {
        const ep = BrandGroupsEndpoints.listDraft(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchListPublished: (opts = {}) => {
        const ep = BrandGroupsEndpoints.listPublished(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdDraft: (documentId, opts = {}) => {
        const ep = BrandGroupsEndpoints.byIdDraft(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdPublished: (documentId, opts = {}) => {
        const ep = BrandGroupsEndpoints.byIdPublished(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    postCreate: (data) => authApi.post('/brand-groups', { data }),
    putUpdateDraft: (documentId, data) => authApi.put(`/brand-groups/${documentId}`, { data, status: 'draft' }),
    postPublish: (documentId) => authApi.post(`/brand-groups/${documentId}/publish`, {}),
    postUnpublish: (documentId) => authApi.post(`/brand-groups/${documentId}/unpublish`, {}),
    delById: (documentId) => authApi.del(`/brand-groups/${documentId}`),
};
