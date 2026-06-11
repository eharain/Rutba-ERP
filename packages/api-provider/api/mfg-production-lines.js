/**
 * MfgProductionLinesEndpoints
 * Pure endpoint descriptors for the /mfg-production-lines resource.
 */
export const MfgProductionLinesEndpoints = {

    meta: {
        uid: 'api::mfg-production-line.mfg-production-line',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { sort } = {}) => ({
        path: '/mfg-production-lines',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
            populate: { branch: true, supervisor: true, parent: true },
        },
    }),

    byId: (documentId) => ({
        path: `/mfg-production-lines/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: { branch: true, supervisor: true, parent: true },
        },
    }),

    create: (data) => ({
        path: '/mfg-production-lines',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-production-lines/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-production-lines/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin'],
    }),
};
