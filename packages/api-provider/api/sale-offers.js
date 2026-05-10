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

    create: (data) => ({ path: '/sale-offers' , data }),
    updateDraft: (documentId, data) => ({ path: `/sale-offers/${documentId}` , data }),
    publish: (documentId) => ({ path: `/sale-offers/${documentId}/publish` }),
    unpublish: (documentId) => ({ path: `/sale-offers/${documentId}/unpublish` }),
    del: (documentId) => ({ path: `/sale-offers/${documentId}` }),

};