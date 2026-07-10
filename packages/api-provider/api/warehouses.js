/**
 * WarehousesEndpoints
 * Pure endpoint descriptors for the /warehouses resource — the physical
 * stock-holding locations that belong to a branch (Inventory Foundation F1).
 */
export const WarehousesEndpoints = {

    meta: {
        uid: 'api::warehouse.warehouse',
        domains: ['inventory', 'stock'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 100, { branchDocId, typeFilter, activeOnly, searchTerm, sort } = {}) => {
        const term = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        return {
            path: '/warehouses',
            action: 'find',
            method: 'get',
            apps: ['inventory', 'stock'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                filters: {
                    ...(branchDocId ? { branch: { documentId: branchDocId } } : {}),
                    ...(typeFilter ? { type: typeFilter } : {}),
                    ...(activeOnly ? { is_active: true } : {}),
                    ...(term ? { $or: [{ name: { $containsi: term } }, { code: { $containsi: term } }] } : {}),
                },
                populate: { branch: true, locations: true },
                sort: sort ?? ['name:asc'],
                pagination: { page, pageSize },
            },
        };
    },

    byId: (documentId) => ({
        path: `/warehouses/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: { branch: true, locations: true },
        },
    }),

    create: (data) => ({
        path: '/warehouses',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/warehouses/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/warehouses/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['inventory', 'stock'],
        approle: ['admin'],
    }),

    /**
     * Admin backfill: ensure every branch has a default warehouse + receiving
     * location and place every unplaced stock-item into it, then rebuild the
     * stock-level cache. Idempotent. (auth:false route + manual admin check;
     * uses action:'create' to satisfy the api-pro verb whitelist like
     * StockItemsEndpoints.recomputeProductStock.)
     */
    backfillDefaultLocations: () => ({
        path: '/warehouses/backfill-default-locations',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin'],
        data: {},
    }),
};
