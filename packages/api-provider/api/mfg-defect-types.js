/**
 * MfgDefectTypesEndpoints
 * Pure endpoint descriptors for the /mfg-defect-types resource.
 */
export const MfgDefectTypesEndpoints = {

    meta: {
        uid: 'api::mfg-defect-type.mfg-defect-type',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { sort } = {}) => ({
        path: '/mfg-defect-types',
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
        path: `/mfg-defect-types/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {},
        },
    }),

    create: (data) => ({
        path: '/mfg-defect-types',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-defect-types/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-defect-types/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin'],
    }),
};
