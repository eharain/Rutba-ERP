/**
 * PayAdjustmentsEndpoints
 * Pure endpoint descriptors for the /pay-adjustments resource.
 */
export const PayAdjustmentsEndpoints = {

    meta: {
        uid: 'api::pay-adjustment.pay-adjustment',
        domains: ['payroll'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { sort } = {}) => ({
        path: '/pay-adjustments',
        action: 'find',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
            populate: { employee: true, payslip: true, payroll_run: true },
        },
    }),

    byId: (documentId) => ({
        path: `/pay-adjustments/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: { employee: true, payslip: true, payroll_run: true },
        },
    }),

    /**
     * List pay adjustments for a specific employee.
     * @param {string} employeeDocId
     * @param {{ page?, pageSize? }} opts
     */
    byEmployee: (employeeDocId, { page = 1, pageSize = 100 } = {}) => ({
        path: '/pay-adjustments',
        action: 'find',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: { employee: { documentId: employeeDocId } },
            populate: { payslip: true },
            sort: ['createdAt:desc'],
            pagination: { page, pageSize },
        },
    }),

    create: (data) => ({
        path: '/pay-adjustments',
        action: 'create',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/pay-adjustments/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/pay-adjustments/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Book the cash handed to an employee for an advance or loan:
     * Dr EMPLOYEE_ADVANCES / Cr cash-or-bank. Idempotent.
     *
     * Named `recordDisbursement` because the api-pro seeder only enumerates
     * descriptor methods whose name starts with a whitelisted verb — a bare
     * `disburse` would be skipped and every call would 403. The controller
     * handler is `disburse`, which is what `action` must match.
     *
     * @param {string} documentId
     * @param {{ method?: 'Cash' | 'Bank' | 'Mobile Wallet' }} body
     */
    recordDisbursement: (documentId, body = {}) => ({
        path: `/pay-adjustments/${documentId}/disburse`,
        action: 'disburse',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data: { ...body },
    }),
};
