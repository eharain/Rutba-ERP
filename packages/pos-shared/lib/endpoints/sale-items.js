/**
 * SaleItemsEndpoints
 * Centralised path + params definitions for the /sale-items content-type.
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
     * Body provided by caller: { data: { sale: { set: [] }, product: { set: [] } } }
     * @param {string} documentId
     */
    disconnect: (documentId) => ({ path: `/sale-items/${documentId}` }),
};
