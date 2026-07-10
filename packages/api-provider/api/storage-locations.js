/**
 * StorageLocationsEndpoints
 * Pure endpoint descriptors for the /storage-locations resource — the bin /
 * shelf / zone tree inside a warehouse (Inventory Foundation F1).
 */
export const StorageLocationsEndpoints = {

    meta: {
        uid: 'api::storage-location.storage-location',
        domains: ['stock', 'inventory'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 200, { warehouseDocId, parentDocId, typeFilter, activeOnly, searchTerm, sort } = {}) => {
        const term = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        return {
            path: '/storage-locations',
            action: 'find',
            method: 'get',
            apps: ['inventory', 'stock'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                filters: {
                    ...(warehouseDocId ? { warehouse: { documentId: warehouseDocId } } : {}),
                    ...(parentDocId ? { parent: { documentId: parentDocId } } : {}),
                    ...(typeFilter ? { type: typeFilter } : {}),
                    ...(activeOnly ? { is_active: true } : {}),
                    ...(term ? { $or: [{ name: { $containsi: term } }, { code: { $containsi: term } }] } : {}),
                },
                populate: { warehouse: true, parent: true },
                sort: sort ?? ['code:asc'],
                pagination: { page, pageSize },
            },
        };
    },

    byId: (documentId) => ({
        path: `/storage-locations/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: { warehouse: true, parent: true, children: true },
        },
    }),

    create: (data) => ({
        path: '/storage-locations',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/storage-locations/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/storage-locations/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['inventory', 'stock'],
        approle: ['admin'],
    }),
};
