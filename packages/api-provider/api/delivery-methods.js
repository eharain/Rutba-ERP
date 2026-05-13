import __publish_generic_helper from "./__publish_generic_helper.js";

export const DeliveryMethodsEndpoints = {
    // todo: spread adds updateDraft/publish/unpublish/create/del. Verify the
    // delivery-method content type has draft-publish enabled; the inline
    // create/update below will override the helper's versions either way.
    ...__publish_generic_helper('delivery-methods'),
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