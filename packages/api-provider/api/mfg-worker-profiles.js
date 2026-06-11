/**
 * MfgWorkerProfilesEndpoints
 * Pure endpoint descriptors for the /mfg-worker-profiles resource.
 */
export const MfgWorkerProfilesEndpoints = {

    meta: {
        uid: 'api::mfg-worker-profile.mfg-worker-profile',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { sort } = {}) => ({
        path: '/mfg-worker-profiles',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
            populate: { employee: true, production_line: true, skill_grades: { populate: { operation: true } } },
        },
    }),

    byId: (documentId) => ({
        path: `/mfg-worker-profiles/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: { employee: true, production_line: true, skill_grades: { populate: { operation: true } } },
        },
    }),

    create: (data) => ({
        path: '/mfg-worker-profiles',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-worker-profiles/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-worker-profiles/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin'],
    }),
};
