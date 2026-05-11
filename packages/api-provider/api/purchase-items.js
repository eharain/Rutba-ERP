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
        approle: ['admin', 'manager']
    }),

    /** Async: fetch purchase items by product documentId. */


    /** Async: fetch all purchase items for a given purchase. */


    /** Async: create a new purchase item. */


    /** Async: update a purchase item by documentId. */


    /** Async: delete a purchase item by documentId. */


    /**
     * Save a single purchase item — PUT if it already exists (id > -1), POST otherwise.
     * Previously standalone function, now part of the endpoint object.
     * @param {Object} item
     */
    savePurchaseItem: async (item) => {
        if (item.id > -1) {
            const res = await PurchaseItemsEndpoints.putUpdate(item.documentId, prepareForPut(item, []));
            return dataNode(res);
        } else {
            const res = await PurchaseItemsEndpoints.postCreate(prepareForPut(item, []));
            return dataNode(res);
        }
    },
};

