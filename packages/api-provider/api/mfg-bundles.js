/**
 * MfgBundlesEndpoints
 * Pure endpoint descriptors for the /mfg-bundles resource (WIP traceability).
 */
export const MfgBundlesEndpoints = {

    meta: {
        uid: 'api::mfg-bundle.mfg-bundle',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 50, { statusFilter, workOrderDocId, sort } = {}) => ({
        path: '/mfg-bundles',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: {
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(workOrderDocId ? { work_order: { documentId: workOrderDocId } } : {}),
            },
            populate: { work_order: true, current_operation: true, production_line: true },
            sort: sort ?? ['createdAt:desc'],
            pagination: { page, pageSize },
        },
    }),

    byId: (documentId) => ({
        path: `/mfg-bundles/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {
                work_order: true,
                current_operation: true,
                production_line: true,
                tasks: { populate: { worker: { populate: { employee: true } }, operation: true } },
                qc_inspections: { populate: { defect_lines: true } },
                material_issues: true,
            },
        },
    }),

    create: (data) => ({
        path: '/mfg-bundles',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-bundles/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-bundles/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Drive the bundle through its state machine.
     * @param {string} documentId
     * @param {string} status  one of Issued|InProgress|QCHold|Completed|Rejected|Scrapped
     * @param {object} [extra] e.g. { quantity_completed, quantity_rejected }
     */
    processTransition: (documentId, status, extra = {}) => ({
        path: `/mfg-bundles/${documentId}/process`,
        action: 'process',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data: { status, ...extra },
    }),
};
