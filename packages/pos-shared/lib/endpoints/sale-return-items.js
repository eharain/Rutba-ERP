/**
 * SaleReturnItemsEndpoints
 * Centralised path + params definitions for the /sale-return-items content-type.
 */
export const SaleReturnItemsEndpoints = {

    /** Create a new sale return item — body provided by caller as { data }. */
    create: () => ({ path: '/sale-return-items' }),

    /**
     * Update a sale return item by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/sale-return-items/${documentId}` }),
};
