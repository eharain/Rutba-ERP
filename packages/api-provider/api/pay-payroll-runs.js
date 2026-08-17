import { listParams, byIdParams } from './__param_builders.js';

/**
 * PayPayrollRunsEndpoints — periodic payroll batches.
 *
 * Reads: list, byId. Writes: create, update, del, and the engine actions
 * runPreview / process / cancel (server-side compute + GL posting). Method
 * names start with an api-pro whitelisted verb so the seeder mints a policy
 * (see strapi-api-pro seeder isDescriptorMethodName); the `action` field is the
 * controller handler the route resolves to at request time.
 */
export const PayPayrollRunsEndpoints = {
    meta: {
        uid: 'api::pay-payroll-run.pay-payroll-run',
        domains: ['payroll'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-payroll-runs',
        action: 'find',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['period_start:desc'], populate: ['payslips'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/pay-payroll-runs/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }, { populate: ['payslips', 'branch'] }),
    }),

    create: (data) => ({
        path: '/pay-payroll-runs',
        action: 'create',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/pay-payroll-runs/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/pay-payroll-runs/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['payroll'],
        approle: ['admin'],
    }),

    /** Dry-run: compute payslips for the period without persisting (wizard preview). */
    runPreview: (documentId) => ({
        path: `/pay-payroll-runs/${documentId}/preview`,
        action: 'preview',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        // Same per-employee gather as `process` (attendance, adjustments, loans,
        // statutory) minus the writes — slow for the same reason, cheaper by a
        // constant factor.
        timeoutMs: 300_000,
    }),

    /** Process the run: persist payslips, lock tasks, post the accrual JE. */
    process: (documentId, extra = {}) => ({
        path: `/pay-payroll-runs/${documentId}/process`,
        action: 'process',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        // Serial per employee: several gather queries, a payslip create, then one
        // accrual journal entry for the run. Payroll is also the request an
        // operator least wants to see fail halfway, and a timeout here abandons
        // the caller while the server keeps writing payslips.
        timeoutMs: 600_000,
        data: { ...extra },
    }),

    /** Cancel a draft/processed run: reverse the accrual, unlock tasks, delete payslips. */
    cancel: (documentId, extra = {}) => ({
        path: `/pay-payroll-runs/${documentId}/cancel`,
        action: 'cancel',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin'],
        data: { ...extra },
    }),
};
