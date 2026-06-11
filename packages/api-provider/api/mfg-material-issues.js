/**
 * MfgMaterialIssuesEndpoints
 * Pure endpoint descriptors for the /mfg-material-issues resource.
 */
export const MfgMaterialIssuesEndpoints = {

    meta: {
        uid: 'api::mfg-material-issue.mfg-material-issue',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { sort } = {}) => ({
        path: '/mfg-material-issues',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
            populate: {
                material_lot: { populate: { product: true } },
                work_order: true,
                bundle: true,
                issued_by: true,
            },
        },
    }),

    byId: (documentId) => ({
        path: `/mfg-material-issues/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {
                material_lot: { populate: { product: true } },
                work_order: true,
                bundle: true,
                issued_by: true,
            },
        },
    }),

    /**
     * List material issues for a specific work order.
     * @param {string} workOrderDocId
     * @param {{ page?, pageSize? }} opts
     */
    byWorkOrder: (workOrderDocId, { page = 1, pageSize = 200 } = {}) => ({
        path: '/mfg-material-issues',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: { work_order: { documentId: workOrderDocId } },
            populate: { material_lot: { populate: { product: true } }, bundle: true },
            sort: ['issued_at:desc'],
            pagination: { page, pageSize },
        },
    }),

    create: (data) => ({
        path: '/mfg-material-issues',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-material-issues/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-material-issues/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
    }),
};
