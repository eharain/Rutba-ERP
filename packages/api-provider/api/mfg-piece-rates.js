/**
 * MfgPieceRatesEndpoints
 * Pure endpoint descriptors for the /mfg-piece-rates resource.
 */
export const MfgPieceRatesEndpoints = {

    meta: {
        uid: 'api::mfg-piece-rate.mfg-piece-rate',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { sort } = {}) => ({
        path: '/mfg-piece-rates',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
            populate: { operation: true, product: true, production_line: true },
        },
    }),

    byId: (documentId) => ({
        path: `/mfg-piece-rates/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: { operation: true, product: true, production_line: true },
        },
    }),

    /**
     * List piece rates for a specific operation.
     * @param {string} operationDocId
     * @param {{ page?, pageSize? }} opts
     */
    byOperation: (operationDocId, { page = 1, pageSize = 100 } = {}) => ({
        path: '/mfg-piece-rates',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: { operation: { documentId: operationDocId } },
            populate: { operation: true, product: true },
            pagination: { page, pageSize },
        },
    }),

    create: (data) => ({
        path: '/mfg-piece-rates',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-piece-rates/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-piece-rates/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin'],
    }),
};
