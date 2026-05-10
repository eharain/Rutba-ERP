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
    create: (data) => ({ path: '/delivery-methods' , data }),
    update: (documentId, data) => ({ path: `/delivery-methods/${documentId}` , data }),

};