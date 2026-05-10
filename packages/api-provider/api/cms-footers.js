export const CmsFootersEndpoints = {
    listDraft: ({ sort, populate, pagination, filters } = {}) => ({
        path: '/cms-footers',
        params: {
            status: 'draft',
            sort: sort ?? ['name:asc'],
            populate: populate ?? ['pinned_pages', 'cms_pages'],
            pagination: pagination ?? { pageSize: 100 },
            ...(filters ? { filters } : {}),
        },
    }),

    listPublished: ({ pageSize = 200 } = {}) => ({
        path: '/cms-footers',
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/cms-footers/${documentId}`,
        params: {
            status: 'draft',
            ...(populate ? { populate } : {}),
        },
    }),

    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/cms-footers/${documentId}`,
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    create: () => ({ path: '/cms-footers' }),
    updateDraft: (documentId) => ({ path: `/cms-footers/${documentId}` }),
    publish: (documentId) => ({ path: `/cms-footers/${documentId}/publish` }),
    unpublish: (documentId) => ({ path: `/cms-footers/${documentId}/unpublish` }),
    del: (documentId) => ({ path: `/cms-footers/${documentId}` }),

    fetchListDraft: (opts = {}) => {
        const ep = CmsFootersEndpoints.listDraft(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchListPublished: (opts = {}) => {
        const ep = CmsFootersEndpoints.listPublished(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdDraft: (documentId, opts = {}) => {
        const ep = CmsFootersEndpoints.byIdDraft(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdPublished: (documentId, opts = {}) => {
        const ep = CmsFootersEndpoints.byIdPublished(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    postCreate: (data) => authApi.post('/cms-footers', { data }),
    putUpdateDraft: (documentId, data) => authApi.put(`/cms-footers/${documentId}`, { data, status: 'draft' }),
    postPublish: (documentId) => authApi.post(`/cms-footers/${documentId}/publish`, {}),
    postUnpublish: (documentId) => authApi.post(`/cms-footers/${documentId}/unpublish`, {}),
    delById: (documentId) => authApi.del(`/cms-footers/${documentId}`),
};