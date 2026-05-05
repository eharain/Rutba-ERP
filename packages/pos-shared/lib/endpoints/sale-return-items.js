import { authApi } from '../api.js';

/**
 * SaleReturnItemsEndpoints
 * Each `post*` / `put*` method owns the full async call — callers use a single await.
 */
export const SaleReturnItemsEndpoints = {

    /** Create a new sale return item — body provided by caller as { data }. */
    create: () => ({ path: '/sale-return-items' }),

    /**
     * Update a sale return item by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/sale-return-items/${documentId}` }),

    /** Async: create a new sale return item. */
    postCreate: (data) => {
        const ep = SaleReturnItemsEndpoints.create();
        return authApi.post(ep.path, { data });
    },

    /** Async: update a sale return item by documentId. */
    putUpdate: (documentId, data) => {
        const ep = SaleReturnItemsEndpoints.update(documentId);
        return authApi.put(ep.path, { data });
    },
};

export const SaleReturnItemsEndpointsMeta = {
    uid: 'api::sale-return-item.sale-return-item',
    basePath: '/sale-return-items',
    methodActions: {
        create: 'create',
        update: 'update',
    },
};



