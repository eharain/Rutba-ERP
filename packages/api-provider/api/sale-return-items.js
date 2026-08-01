/**
 * SaleReturnItemsEndpoints
 * Pure endpoint descriptors for the /sale-return-items resource.
 */
export const SaleReturnItemsEndpoints = {
    // `uid` and `roles` are load-bearing, not decoration: up-permissions-seed
    // grants only content-types reachable via a descriptor's meta.uid, and the
    // api-pro seeder emits no policy without roles — so omitting them left this
    // resource denied by default for every role while every other return
    // endpoint worked.
    meta: {
        uid: 'api::sale-return-item.sale-return-item',
        domains: ['sale', 'return'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** Create a new sale return item. */
    create: (data) => ({
        path: '/sale-return-items',
        action: 'create',
        method: 'post',
        apps: ['sale', 'return'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Update a sale return item by documentId â€” body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/sale-return-items/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['sale', 'return'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
/** Async: update a sale return item by documentId. */

};

/**
 * SaleReturnItemsEndpointRules
 * Per-endpoint requestRules stored in the api-pro method-policy record.
 */
export const SaleReturnItemsEndpointRules = {
    /** POST /api/sale-return-items â€” create */
    create: {},

    /** PUT /api/sale-return-items/:id â€” update */
    update: {},
};