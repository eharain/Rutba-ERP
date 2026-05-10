/**
 * SaleReturnItemsEndpoints
 * Pure endpoint descriptors for the /sale-return-items resource.
 */
export const SaleReturnItemsEndpoints = {

    /** Create a new sale return item. */
    create: (data) => ({ path: '/sale-return-items', action: 'create', method: 'post', data , data }),

    /**
     * Update a sale return item by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId, data) => ({ path: `/sale-return-items/${documentId}` , data }),
/** Async: update a sale return item by documentId. */

};

/**
 * SaleReturnItemsEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const SaleReturnItemsEndpointRules = {
    /** POST /api/sale-return-items — create */
    create: {},

    /** PUT /api/sale-return-items/:id — update */
    update: {},
};