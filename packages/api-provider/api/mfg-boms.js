/**
 * MfgBomsEndpoints
 * Pure endpoint descriptors for the /mfg-boms resource.
 */
export const MfgBomsEndpoints = {

    meta: {
        uid: 'api::mfg-bom.mfg-bom',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { sort } = {}) => ({
        path: '/mfg-boms',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
            populate: {
                product: true,
                production_line: true,
                material_lines: { populate: { material_product: true } },
                routing_steps: { populate: { operation: true } },
            },
        },
    }),

    byId: (documentId) => ({
        path: `/mfg-boms/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {
                product: true,
                production_line: true,
                material_lines: { populate: { material_product: true } },
                routing_steps: { populate: { operation: true } },
            },
        },
    }),

    create: (data) => ({
        path: '/mfg-boms',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-boms/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-boms/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
    }),
};
