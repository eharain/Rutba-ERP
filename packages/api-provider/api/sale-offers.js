import { listParams, byIdParams } from './__param_builders.js';

export const SaleOffersEndpoints = {
    listDraft: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/sale-offers',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['product_groups', 'cms_pages', 'categories'], pageSize: 50 },
            { status: 'draft' },
        ),
    }),

    listPublished: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/sale-offers',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { pageSize: 200, fields: ['documentId'] },
            { status: 'published' },
        ),
    }),

    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/sale-offers/${documentId}`,
        params: byIdParams({ populate, fields }, {}, { status: 'draft' }),
    }),

    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/sale-offers/${documentId}`,
        params: byIdParams({ populate, fields }, {}, { status: 'published' }),
    }),

    create: (data) => ({ path: '/sale-offers' , data }),
    updateDraft: (documentId, data) => ({ path: `/sale-offers/${documentId}` , data }),
    publish: (documentId) => ({ path: `/sale-offers/${documentId}/publish` }),
    unpublish: (documentId) => ({ path: `/sale-offers/${documentId}/unpublish` }),
    del: (documentId) => ({ path: `/sale-offers/${documentId}` }),

};