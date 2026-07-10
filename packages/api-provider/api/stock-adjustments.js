/**
 * StockAdjustmentsEndpoints
 * Pure endpoint descriptors for the /stock-adjustments resource — write-off /
 * damage / loss / expiry of serialized stock with best-effort GL (Epic 2 P3).
 */
export const StockAdjustmentsEndpoints = {

    meta: {
        uid: 'api::stock-adjustment.stock-adjustment',
        domains: ['inventory', 'stock'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 50, { statusFilter, typeFilter, warehouseDocId, searchTerm, sort } = {}) => {
        const term = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        return {
            path: '/stock-adjustments',
            action: 'find',
            method: 'get',
            apps: ['inventory', 'stock'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                filters: {
                    ...(statusFilter ? { status: statusFilter } : {}),
                    ...(typeFilter ? { type: typeFilter } : {}),
                    ...(warehouseDocId ? { warehouse: { documentId: warehouseDocId } } : {}),
                    ...(term ? { $or: [{ adjustment_number: { $containsi: term } }, { reason: { $containsi: term } }] } : {}),
                },
                populate: { warehouse: true, stock_items: { count: true } },
                sort: sort ?? ['createdAt:desc'],
                pagination: { page, pageSize },
            },
        };
    },

    byId: (documentId) => ({
        path: `/stock-adjustments/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: { warehouse: true, stock_items: { populate: { product: true } } },
        },
    }),

    create: (data) => ({
        path: '/stock-adjustments',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/stock-adjustments/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/stock-adjustments/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
    }),

    /** Post a Draft adjustment — units go to a loss status + best-effort GL. */
    post: (documentId) => ({
        path: `/stock-adjustments/${documentId}/post`,
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data: {},
    }),

    /** Cancel a Draft/Posted adjustment — revert units to InStock + reverse GL. */
    cancel: (documentId) => ({
        path: `/stock-adjustments/${documentId}/cancel`,
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data: {},
    }),
};
