export const CategoryGroupsEndpoints = {
    listDraft: ({ sort, populate, pagination } = {}) => ({
        path: '/category-groups',
        params: {
            status: 'draft',
            sort: sort ?? ['sort_order:asc', 'createdAt:desc'],
            populate: populate ?? ['categories'],
            pagination: pagination ?? { pageSize: 50 },
        },
    }),

    listPublished: ({ pageSize = 200 } = {}) => ({
        path: '/category-groups',
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/category-groups/${documentId}`,
        params: {
            status: 'draft',
            ...(populate ? { populate } : {}),
        },
    }),

    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/category-groups/${documentId}`,
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    create: () => ({ path: '/category-groups' }),
    updateDraft: (documentId) => ({ path: `/category-groups/${documentId}` }),
    publish: (documentId) => ({ path: `/category-groups/${documentId}/publish` }),
    unpublish: (documentId) => ({ path: `/category-groups/${documentId}/unpublish` }),
    del: (documentId) => ({ path: `/category-groups/${documentId}` }),

    fetchListDraft: (opts = {}) => {
        const ep = CategoryGroupsEndpoints.listDraft(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchListPublished: (opts = {}) => {
        const ep = CategoryGroupsEndpoints.listPublished(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdDraft: (documentId, opts = {}) => {
        const ep = CategoryGroupsEndpoints.byIdDraft(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdPublished: (documentId, opts = {}) => {
        const ep = CategoryGroupsEndpoints.byIdPublished(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    postCreate: (data) => authApi.post('/category-groups', { data }),
    putUpdateDraft: (documentId, data) => authApi.put(`/category-groups/${documentId}`, { data, status: 'draft' }),
    postPublish: (documentId) => authApi.post(`/category-groups/${documentId}/publish`, {}),
    postUnpublish: (documentId) => authApi.post(`/category-groups/${documentId}/unpublish`, {}),
    delById: (documentId) => authApi.del(`/category-groups/${documentId}`),
};