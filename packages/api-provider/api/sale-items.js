import { StockItemsEndpoints } from './stock-items.js';

/**
 * SaleItemsEndpoints
 * Each `fetch*` / `post*` / `put*` method owns the full async call — callers use a single await.
 */
export const SaleItemsEndpoints = {

    meta: {
        uid: 'api::sale-item.sale-item',
        domains: ['sale', 'stock'],
        roles: ['admin', 'manager', 'staff']
    },

    /** Create a new sale item — body provided by caller as { data }. */
    create: () => ({
        path: '/sale-items',
        action: 'create',
        method: 'post',
        apps: ['sale', 'stock'],
        approle: ['admin', 'manager', 'staff']
    }),

    /**
     * Update a sale item by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({
        path: `/sale-items/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['sale', 'stock'],
        approle: ['admin', 'manager']
    }),

    /**
     * Disconnect a sale item from its sale (zero-out relations).
     * @param {string} documentId
     */
    disconnect: (documentId) => ({
        path: `/sale-items/${documentId}`,
        action: 'disconnect',
        method: 'put',
        apps: ['sale', 'stock'],
        approle: ['admin', 'manager']
    }),

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

    /**
     * Save an array of sale items: creates each sale item and marks each stock item as Sold.
     * Previously standalone function, now part of the endpoint object.
     * @param {string} saleId - documentId of the parent sale
     * @param {Array} items
     */
    saveSaleItems: async (saleId, items) => {
        const promises = items.map(async (i) => {
            const result = await SaleItemsEndpoints.postCreate({
                items: [i.documentId],
                quantity: i.quantity,
                price: i.price,
                product: i.product.documentId,
                sale: saleId,
            });
            await StockItemsEndpoints.putUpdate(i.documentId, { status: 'Sold' });
            return result;
        });
        return await Promise.all(promises);
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