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

    create: (data) => ({ path: '/product-groups', action: 'create', method: 'post', data , data }),
    updateDraft: (documentId, data) => ({ path: `/product-groups/${documentId}`, action: 'update', method: 'put', params: { status: 'draft' }, data , data }),
    publish: (documentId) => ({ path: `/product-groups/${documentId}/publish`, action: 'publish', method: 'post' }),
    unpublish: (documentId) => ({ path: `/product-groups/${documentId}/unpublish`, action: 'unpublish', method: 'post' }),
    del: (documentId) => ({ path: `/product-groups/${documentId}`, action: 'delete', method: 'delete' }),

};