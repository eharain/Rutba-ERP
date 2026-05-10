export const StockInputsEndpoints = {
    meta: {
        uid: 'api::stock-input.stock-input',
        domains: ['stock'],
        roles: ['admin', 'manager', 'staff']
    },

    list: (opts = {}) => ({
        path: '/stock-inputs',
        action: 'find',
        method: 'get',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        params: opts,
    }),
    byId: (documentId, params = {}) => ({
        path: `/stock-inputs/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        params,
    }),
    create: (data) => ({
        path: '/stock-inputs',
        action: 'create',
        method: 'post',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    update: (documentId, data) => ({
        path: `/stock-inputs/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    del: (documentId) => ({
        path: `/stock-inputs/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['stock'],
        approle: ['admin', 'manager'],
    }),
    process: (data) => ({
        path: '/stock-inputs/process',
        action: 'process',
        method: 'post',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
};

