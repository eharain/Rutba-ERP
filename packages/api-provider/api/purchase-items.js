/**
 * PurchaseItemsEndpoints
 * Pure endpoint descriptors for the /purchase-items resource.
 */
export const PurchaseItemsEndpoints = {

    meta: {
        uid: 'api::purchase-item.purchase-item',
        domains: ['purchase', 'stock'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * List purchase items for a given purchase documentId.
     * @param {string} purchaseDocId
     * @param {{ populate? }} opts
     */
    list: (purchaseDocId, { populate } = {}) => ({
        path: '/purchase-items',
        action: 'find',
        method: 'get',
        apps: ['purchase', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: { purchase: { documentId: { $eq: purchaseDocId } } },
            populate: populate ?? { product: true },
        },
    }),

    /** Create a new purchase item. */
    create: (data) => ({
        path: '/purchase-items',
        action: 'create',
        method: 'post',
        apps: ['purchase', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * List purchase items by product documentId (for counting or transfer).
     * @param {string} productDocId
     * @param {{ page?, pageSize? }} opts
     */
    byProduct: (productDocId, { page = 1, pageSize = 100 } = {}) => ({
        path: '/purchase-items',
        params: {
            filters: { product: { documentId: productDocId } },
            pagination: { page, pageSize },
        },
    }),

    /**
     * Update a purchase item by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/purchase-items/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['purchase', 'stock'],
        approle: ['admin', 'manager'],
        data,
    }),

    /**
     * Delete a purchase item by documentId.
     *
     * todo: speculative stub — added because pos-stock/pages/[documentId]/purchase.js
     * needs to remove items from an open purchase. Confirm the Strapi controller
     * actually accepts DELETE on this route (the content type's policies may block
     * mid-flow deletion). If blocked, switch to a soft-delete or disconnect pattern.
     */
    del: (documentId) => ({
        path: `/purchase-items/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['purchase', 'stock'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Save a single purchase item — PUT if it already exists (id > -1), POST otherwise.
     * @param {Object} item
     */
    savePurchaseItem: async (item) => {
        if (item.id > -1) {
            const res = await PurchaseItemsEndpoints.update(item.documentId, prepareForPut(item, []));
            return dataNode(res);
        } else {
            const res = await PurchaseItemsEndpoints.create(prepareForPut(item, []));
            return dataNode(res);
        }
    },
};

