import { authApi } from '../api.js';

/**
 * SaleItemsEndpoints
 * Each `fetch*` / `post*` / `put*` method owns the full async call — callers use a single await.
 */
export const SaleItemsEndpoints = {

    /** Create a new sale item — body provided by caller as { data }. */
    create: () => ({ path: '/sale-items' }),

    /**
     * Update a sale item by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/sale-items/${documentId}` }),

    /**
     * Disconnect a sale item from its sale (zero-out relations).
     * @param {string} documentId
     */
    disconnect: (documentId) => ({ path: `/sale-items/${documentId}` }),

    /** Async: create a new sale item. */
    postCreate: (data) => {
        const ep = SaleItemsEndpoints.create();
        return authApi.post(ep.path, { data });
    },

    /** Async: update a sale item by documentId. */
    putUpdate: (documentId, data) => {
        const ep = SaleItemsEndpoints.update(documentId);
        return authApi.put(ep.path, { data });
    },

    /** Async: disconnect a sale item from its sale. */
    putDisconnect: (documentId) => {
        const ep = SaleItemsEndpoints.disconnect(documentId);
        return authApi.put(ep.path, { data: { sale: { set: [] }, product: { set: [] } } });
    },
};

export const SaleItemsEndpointsMeta = {
    uid: 'api::sale-item.sale-item',
    basePath: '/sale-items',
    methodActions: {
        create: 'create',
        update: 'update',
        disconnect: 'update',
    },
};

/**
 * SaleItemsEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const SaleItemsEndpointRules = {
    /** POST /api/sale-items — create */
    create: {},

    /** PUT /api/sale-items/:id — update */
    update: {},

    /** PUT /api/sale-items/:id — disconnect (clears relations) */
    disconnect: {
        allowedBodyFields: ['sale', 'product'],
    },
};



