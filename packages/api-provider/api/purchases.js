
/**
 * PurchasesEndpoints
 * Centralised path + params definitions for the /purchases content-type.
 */
export const PurchasesEndpoints = {

    meta: {
        uid: 'api::purchase.purchase',
        domains: ['cms', 'orders', 'stock'],
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
        // 'purchase' is not a domain key (see config/domains.json) — it granted
        // nothing. 'cms', 'order-management' and 'inventory' render the
        // "All Purchases" filter cell on their product lists (ProductPickerTabs);
        // without the grant api-pro 403s the lookup.
        apps: ['stock', 'cms', 'orders', 'control'],
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
        apps: ['stock', 'control'],
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
        apps: ['stock', 'control'],
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
        apps: ['stock', 'control'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/purchases/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['stock', 'control'],
        approle: ['admin', 'manager', 'staff'],
    }),

    /**
     * Generate a supplier bill (acc-bill) from a received purchase → posts AP.
     *
     * Carries the accounts apps because this is the accountant's action (the
     * spec's "reconcile to the supplier invoice, then post") — a wider set than
     * the stock/inventory pair the rest of this interface grants.
     */
    createBill: (documentId) => ({
        path: `/purchases/${documentId}/generate-bill`,
        action: 'generateBill',
        method: 'post',
        apps: ['accounts', 'accounts-ap', 'stock', 'control'],
        approle: ['admin', 'manager'],
    }),
};
