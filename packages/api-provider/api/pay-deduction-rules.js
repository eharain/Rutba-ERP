import { listParams, byIdParams } from './__param_builders.js';

/**
 * PayDeductionRulesEndpoints — configurable statutory deductions / employer
 * contributions applied during a payroll run. Generic: each tenant defines its
 * own rules (income tax slabs, social security, pension, insurance, …); no
 * jurisdiction is hard-coded. Admin/manager only.
 */
export const PayDeductionRulesEndpoints = {
    meta: {
        uid: 'api::pay-deduction-rule.pay-deduction-rule',
        domains: ['payroll'],
        roles: ['admin', 'manager'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-deduction-rules',
        action: 'find',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['sequence:asc'], populate: ['brackets', 'branch'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/pay-deduction-rules/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: byIdParams({ populate, fields }, { populate: ['brackets', 'branch'] }),
    }),

    create: (data) => ({
        path: '/pay-deduction-rules',
        action: 'create',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/pay-deduction-rules/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/pay-deduction-rules/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['payroll'],
        approle: ['admin'],
    }),
};
