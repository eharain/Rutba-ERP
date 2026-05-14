import { listParams } from './__param_builders.js';

export const PayPayslipsEndpoints = {
    meta: { domains: ['payroll'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-payslips',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['employee'] },
        ),
    }),

};