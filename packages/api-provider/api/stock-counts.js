/**
 * StockCountsEndpoints
 * Pure endpoint descriptors for the /stock-counts resource — physical cycle
 * counts / stock-takes with variance -> loss posting (Inventory Epic 3).
 */
export const StockCountsEndpoints = {

    meta: {
        uid: 'api::stock-count.stock-count',
        domains: ['inventory', 'stock'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 50, { statusFilter, branchDocId, searchTerm, sort } = {}) => {
        const term = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        return {
            path: '/stock-counts',
            action: 'find',
            method: 'get',
            apps: ['inventory', 'stock'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                filters: {
                    ...(statusFilter ? { status: statusFilter } : {}),
                    ...(branchDocId ? { branch: { documentId: branchDocId } } : {}),
                    ...(term ? { count_number: { $containsi: term } } : {}),
                },
                populate: { branch: true },
                sort: sort ?? ['createdAt:desc'],
                pagination: { page, pageSize },
            },
        };
    },

    byId: (documentId) => ({
        path: `/stock-counts/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: { populate: { branch: true, lines: true } },
    }),

    create: (data) => ({
        path: '/stock-counts',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/stock-counts/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/stock-counts/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
    }),

    /** Post a Draft count — shortages book unit losses. */
    post: (documentId) => ({
        path: `/stock-counts/${documentId}/post`,
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data: {},
    }),

    /** Cancel a Draft count. */
    cancel: (documentId) => ({
        path: `/stock-counts/${documentId}/cancel`,
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data: {},
    }),
};
