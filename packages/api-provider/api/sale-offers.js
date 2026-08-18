import { listParams, byIdParams } from './__param_builders.js';

export const SaleOffersEndpoints = {
    meta: {
        uid: 'api::sale-offer.sale-offer',
        domains: ['cms', 'storefront', 'portal', 'orders'],
        roles: ['admin', 'manager', 'staff', 'public', 'user'],
    },

    // Live offers that reach a product, each with the price it would give.
    // Feeds the per-line discount picker in apps/sales/orders — staff
    // pick an offer explicitly (no storefront group click-context), and the
    // order line stores the chosen offer. Read-only: the binding check runs
    // server-side on save, in validateOrderPricing.
    listOffersForProduct: (productDocumentId) => ({
        path: `/sale-offers/for-product/${productDocumentId}`,
        action: 'listOffersForProduct',
        method: 'get',
        apps: ['orders', 'pos', 'cms'],
        approle: ['admin', 'manager', 'staff'],
    }),

    listDraft: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/sale-offers',
        action: 'find',
        method: 'get',
        apps: ['cms'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['product_groups', 'cms_pages', 'categories'], pageSize: 50 },
            { status: 'draft' },
        ),
    }),

    listPublished: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/sale-offers',
        action: 'find',
        method: 'get',
        apps: ['cms', 'storefront', 'portal'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { pageSize: 200, fields: ['documentId'] },
            { status: 'published' },
        ),
    }),

    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/sale-offers/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['cms'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }, {}, { status: 'draft' }),
    }),

    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/sale-offers/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['cms', 'storefront', 'portal'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: byIdParams({ populate, fields }, {}, { status: 'published' }),
    }),

    create: (data) => ({
        path: '/sale-offers',
        action: 'create',
        method: 'post',
        apps: ['cms'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    updateDraft: (documentId, data) => ({
        path: `/sale-offers/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['cms'],
        approle: ['admin', 'manager', 'staff'],
        params: { status: 'draft' },
        data,
    }),
    publish: (documentId) => ({
        path: `/sale-offers/${documentId}/publish`,
        action: 'publish',
        method: 'post',
        apps: ['cms'],
        approle: ['admin', 'manager'],
    }),
    unpublish: (documentId) => ({
        path: `/sale-offers/${documentId}/unpublish`,
        action: 'unpublish',
        method: 'post',
        apps: ['cms'],
        approle: ['admin', 'manager'],
    }),
    del: (documentId) => ({
        path: `/sale-offers/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['cms'],
        approle: ['admin', 'manager'],
    }),
};