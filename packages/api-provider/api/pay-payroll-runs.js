import { listParams } from './__param_builders.js';

export const PayPayrollRunsEndpoints = {
    meta: { domains: ['payroll'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-payroll-runs',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['period_start:desc'] },
        ),
    }),

};