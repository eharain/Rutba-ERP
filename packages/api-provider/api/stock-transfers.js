/**
 * StockTransfersEndpoints
 * Pure endpoint descriptors for the /stock-transfers resource — two-sided
 * branch-to-branch transfers of serialized stock (Inventory Epic 2 P2).
 */
export const StockTransfersEndpoints = {

    meta: {
        uid: 'api::stock-transfer.stock-transfer',
        domains: ['inventory', 'stock'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 50, { statusFilter, fromBranchDocId, toBranchDocId, searchTerm, sort } = {}) => {
        const term = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        return {
            path: '/stock-transfers',
            action: 'find',
            method: 'get',
            apps: ['inventory', 'stock'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                filters: {
                    ...(statusFilter ? { status: statusFilter } : {}),
                    ...(fromBranchDocId ? { from_branch: { documentId: fromBranchDocId } } : {}),
                    ...(toBranchDocId ? { to_branch: { documentId: toBranchDocId } } : {}),
                    ...(term ? { transfer_number: { $containsi: term } } : {}),
                },
                populate: { from_branch: true, to_branch: true, to_location: true, stock_items: { count: true } },
                sort: sort ?? ['createdAt:desc'],
                pagination: { page, pageSize },
            },
        };
    },

    byId: (documentId) => ({
        path: `/stock-transfers/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {
                from_branch: true,
                to_branch: true,
                to_location: true,
                stock_items: { populate: { product: true } },
            },
        },
    }),

    create: (data) => ({
        path: '/stock-transfers',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/stock-transfers/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/stock-transfers/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
    }),

    /** Dispatch a Draft transfer — units go in-transit. (auth:false route; action:'create' for the verb whitelist.) */
    dispatch: (documentId) => ({
        path: `/stock-transfers/${documentId}/dispatch`,
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data: {},
    }),

    /** Receive an in-transit transfer — units land InStock at the destination. */
    receive: (documentId) => ({
        path: `/stock-transfers/${documentId}/receive`,
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data: {},
    }),

    /** Cancel a Draft/InTransit transfer — in-transit units revert to InStock at origin. */
    cancel: (documentId) => ({
        path: `/stock-transfers/${documentId}/cancel`,
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data: {},
    }),
};
