/**
 * ReorderPoliciesEndpoints
 * Pure endpoint descriptors for /reorder-policies — per-(product, warehouse)
 * replenishment policy CRUD + the compute-on-read suggestion engine (Epic 4).
 */
export const ReorderPoliciesEndpoints = {

    meta: {
        uid: 'api::reorder-policy.reorder-policy',
        domains: ['inventory', 'stock'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 50, { productDocId, warehouseDocId, sort } = {}) => ({
        path: '/reorder-policies',
        action: 'find',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: {
                ...(productDocId ? { product: { documentId: productDocId } } : {}),
                ...(warehouseDocId ? { warehouse: { documentId: warehouseDocId } } : {}),
            },
            populate: { product: true, warehouse: true, preferred_supplier: true, source_warehouse: true },
            sort: sort ?? ['createdAt:desc'],
            pagination: { page, pageSize },
        },
    }),

    byId: (documentId) => ({
        path: `/reorder-policies/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: { populate: { product: true, warehouse: true, preferred_supplier: true, source_warehouse: true } },
    }),

    create: (data) => ({
        path: '/reorder-policies',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/reorder-policies/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/reorder-policies/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Compute-on-read replenishment suggestions (triggered targets, most-deficient
     * first). Route is auth:false + manual auth; handler suggestions.getReorderSuggestions.
     */
    suggestions: ({ warehouseDocId } = {}) => ({
        path: `/reorder-policies/suggestions${warehouseDocId ? `?warehouse=${warehouseDocId}` : ''}`,
        action: 'find',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
    }),
};
