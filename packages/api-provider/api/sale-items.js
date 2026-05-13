/**
 * SaleItemsEndpoints
 * Pure endpoint descriptors for the /sale-items resource.
 */
export const SaleItemsEndpoints = {

    meta: {
        uid: 'api::sale-item.sale-item',
        domains: ['sale', 'stock'],
        roles: ['admin', 'manager', 'staff']
    },

    /** Create a new sale item. */
    create: (data) => ({
        path: '/sale-items',
        action: 'create',
        method: 'post',
        apps: ['sale', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Update a sale item by documentId. */
    update: (documentId, data) => ({
        path: `/sale-items/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['sale', 'stock'],
        approle: ['admin', 'manager'],
        data,
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


    /** Async: update a sale item by documentId. */


    /** Async: disconnect a sale item from its sale. */


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
 * Per-endpoint requestRules stored in the api-pro method-policy record.
 */
export const SaleItemsEndpointRules = {
    /** POST /api/sale-items â€” create */
    create: {},

    /** PUT /api/sale-items/:id â€” update */
    update: {},

    /** PUT /api/sale-items/:id â€” disconnect (clears relations) */
    disconnect: {
        allowedBodyFields: ['sale', 'product'],
    },
};