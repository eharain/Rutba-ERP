import { listParams, byIdParams } from './__param_builders.js';

/**
 * PayPayslipsEndpoints — individual payslips per run.
 *
 * listMyPayslips is employee self-service (the controller resolves the caller's
 * hr-employee and returns only their own) — exposed to the hr app too. setPaid
 * marks a payslip paid and posts the payout journal entry.
 */
export const PayPayslipsEndpoints = {
    meta: {
        uid: 'api::pay-payslip.pay-payslip',
        domains: ['payroll'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-payslips',
        action: 'find',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['employee', 'payroll_run'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/pay-payslips/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: byIdParams({ populate, fields }, { populate: ['employee', 'payroll_run', 'lines', 'tasks'] }),
    }),

    /** The logged-in employee's own payslips (self-service; surfaced in rutba-hr). */
    listMyPayslips: () => ({
        path: '/pay-payslips/my-payslips',
        action: 'myPayslips',
        method: 'get',
        apps: ['payroll', 'hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    /** Mark a payslip paid + post the payout journal entry. */
    setPaid: (documentId, extra = {}) => ({
        path: `/pay-payslips/${documentId}/mark-paid`,
        action: 'markPaid',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin'],
        data: { ...extra },
    }),
};
