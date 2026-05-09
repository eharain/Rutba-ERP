import { authApi } from '../lib/api.js';
import { prepareForPut } from '../utils.js';
import { dataNode } from '../pos/search.js';

/**
 * PurchaseItemsEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const PurchaseItemsEndpoints = {

    /**
     * List purchase items for a given purchase documentId.
     * @param {string} purchaseDocId
     * @param {{ populate? }} opts
     */
    list: (purchaseDocId, { populate } = {}) => ({
        path: '/purchase-items',
        params: {
            filters: { purchase: { documentId: { $eq: purchaseDocId } } },
            populate: populate ?? { product: true },
        },
    }),

    /** Create a new purchase item — body provided by caller as { data }. */
    create: () => ({ path: '/purchase-items' }),

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
    update: (documentId) => ({ path: `/purchase-items/${documentId}` }),

    /** Async: fetch purchase items by product documentId. */
    fetchByProduct: (productDocId, opts = {}) => {
        const ep = PurchaseItemsEndpoints.byProduct(productDocId, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch all purchase items for a given purchase. */
    fetchList: (purchaseDocId, opts = {}) => {
        const ep = PurchaseItemsEndpoints.list(purchaseDocId, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: create a new purchase item. */
    postCreate: (data) => authApi.post('/purchase-items', { data }),

    /** Async: update a purchase item by documentId. */
    putUpdate: (documentId, data) => authApi.put(`/purchase-items/${documentId}`, { data }),

    /** Async: delete a purchase item by documentId. */
    putDelete: (documentId) => authApi.del(`/purchase-items/${documentId}`),
};

/**
 * PurchaseItemsEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const PurchaseItemsEndpointRules = {
    /** GET /api/purchase-items — paginated list */
    list: {},

    /**
     * GET /api/purchase-items — byProduct
     * Client passes: ?productDocId=<documentId>
     * Server injects: filter by purchase_items belonging to a product
     */
    byProduct: {
        filters: {
            product: { documentId: { $eq: '$query.productDocId' } },
        },
    },

    /** POST /api/purchase-items — create */
    create: {},

    /** PUT /api/purchase-items/:id — update */
    update: {},

    /** DELETE /api/purchase-items/:id */
    delete: {},
};

/**
 * Save a single purchase item — PUT if it already exists (id > -1), POST otherwise.
 * @param {Object} item
 */
export async function savePurchaseItem(item) {
    if (item.id > -1) {
        const res = await PurchaseItemsEndpoints.putUpdate(item.documentId, prepareForPut(item, []));
        return dataNode(res);
    } else {
        const res = await PurchaseItemsEndpoints.postCreate(prepareForPut(item, []));
        return dataNode(res);
    }
}



