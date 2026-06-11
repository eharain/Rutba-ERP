/**
 * MfgQcInspectionsEndpoints
 * Pure endpoint descriptors for the /mfg-qc-inspections resource.
 */
export const MfgQcInspectionsEndpoints = {

    meta: {
        uid: 'api::mfg-qc-inspection.mfg-qc-inspection',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { sort } = {}) => ({
        path: '/mfg-qc-inspections',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
            populate: {
                work_order: true,
                bundle: true,
                task: true,
                operation: true,
                inspector: true,
                defect_lines: { populate: { defect_type: true, responsible_worker: true } },
            },
        },
    }),

    byId: (documentId) => ({
        path: `/mfg-qc-inspections/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {
                work_order: true,
                bundle: true,
                task: true,
                operation: true,
                inspector: true,
                defect_lines: { populate: { defect_type: true, responsible_worker: true } },
            },
        },
    }),

    create: (data) => ({
        path: '/mfg-qc-inspections',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-qc-inspections/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-qc-inspections/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
    }),
};
