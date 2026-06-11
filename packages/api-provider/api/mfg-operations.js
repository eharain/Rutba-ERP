/**
 * MfgOperationsEndpoints
 * Pure endpoint descriptors for the /mfg-operations resource.
 */
export const MfgOperationsEndpoints = {

    meta: {
        uid: 'api::mfg-operation.mfg-operation',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { sort } = {}) => ({
        path: '/mfg-operations',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
            populate: {},
        },
    }),

    byId: (documentId) => ({
        path: `/mfg-operations/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {},
        },
    }),

    create: (data) => ({
        path: '/mfg-operations',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-operations/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-operations/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin'],
    }),
};
