
/**
 * PurchasesEndpoints
 * Centralised path + params definitions for the /purchases content-type.
 */
export const PurchasesEndpoints = {

    meta: {
        uid: 'api::purchase.purchase',
        domains: ['cms', 'order-management', 'stock'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * List purchases with optional pagination and populate.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, filters?, populate? }} opts
     */
    list: (page = 1, pageSize = 100, { sort, filters, populate } = {}) => ({
        path: '/purchases',
        action: 'find',
        method: 'get',
        apps: ['purchase', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['createdAt:desc'],
            filters: filters ?? undefined,
            pagination: { page, pageSize },
            populate: populate ?? { suppliers: true },
        },
    }),

    /**
     * Fetch a single purchase by documentId / id / orderId with full detail populate.
     * Used by fetchPurchaseByIdDocumentIdOrPO — urlAndRelations previously built this as a qs string.
     * @param {string|number} idOrOrderId
     */
    byId: (idOrOrderId) => ({
        path: '/purchases/',
        action: 'findOne',
        method: 'get',
        apps: ['purchase', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: {
                $or: [
                    { orderId: idOrOrderId },
                    { id: idOrOrderId },
                    { documentId: idOrOrderId },
                ],
            },
            populate: {
                suppliers: true,
                receipts: true,
                gallery: true,
                items: {
                    populate: { product: true },
                },
            },
        },
    }),

    /** Create a new purchase descriptor. */
    create: (data) => ({
        path: '/purchases',
        action: 'create',
        method: 'post',
        apps: ['purchase', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Update a purchase descriptor by documentId.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/purchases/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['purchase', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/purchases/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['purchase', 'stock'],
        approle: ['admin', 'manager', 'staff'],
    }),

    /** Generate a supplier bill (acc-bill) from a received purchase → posts AP. */
    createBill: (documentId) => ({
        path: `/purchases/${documentId}/generate-bill`,
        action: 'generateBill',
        method: 'post',
        apps: ['purchase', 'stock'],
        approle: ['admin', 'manager'],
    }),
};
