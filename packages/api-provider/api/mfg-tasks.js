/**
 * MfgTasksEndpoints
 * Pure endpoint descriptors for the /mfg-tasks resource — the core worker
 * output + piece-rate record. assign = create; transitions go through /process,
 * and the payroll-gating approve/reject have their own manager-only endpoints.
 */
export const MfgTasksEndpoints = {

    meta: {
        uid: 'api::mfg-task.mfg-task',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { statusFilter, workOrderDocId, bundleDocId, workerDocId, sort } = {}) => ({
        path: '/mfg-tasks',
        action: 'find',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: {
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(workOrderDocId ? { work_order: { documentId: workOrderDocId } } : {}),
                ...(bundleDocId ? { bundle: { documentId: bundleDocId } } : {}),
                ...(workerDocId ? { worker: { documentId: workerDocId } } : {}),
            },
            populate: {
                operation: true,
                worker: { populate: { employee: true } },
                bundle: true,
                work_order: true,
            },
            sort: sort ?? ['createdAt:desc'],
            pagination: { page, pageSize },
        },
    }),

    byId: (documentId) => ({
        path: `/mfg-tasks/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {
                operation: true,
                worker: { populate: { employee: true } },
                bundle: true,
                work_order: { populate: { product: true } },
                piece_rate_card: true,
                payslip: true,
                qc_inspections: true,
            },
        },
    }),

    /** Assign a task to a worker (create). */
    create: (data) => ({
        path: '/mfg-tasks',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-tasks/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-tasks/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Move a task through start/complete/rework/cancel. Floor staff allowed.
     * @param {string} documentId
     * @param {string} status  one of InProgress|Completed|Reworked|Cancelled
     * @param {object} [extra] e.g. { quantity_completed }
     */
    processTransition: (documentId, status, extra = {}) => ({
        path: `/mfg-tasks/${documentId}/process`,
        action: 'process',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data: { status, ...extra },
    }),

    /** Approve a completed task — makes its amount payroll-eligible (manager only). */
    approveTask: (documentId, extra = {}) => ({
        path: `/mfg-tasks/${documentId}/approve`,
        action: 'approve',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data: { ...extra },
    }),

    /** Reject a completed task — zeroes the amount (manager only). */
    rejectTask: (documentId, extra = {}) => ({
        path: `/mfg-tasks/${documentId}/reject`,
        action: 'reject',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data: { ...extra },
    }),
};
