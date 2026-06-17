import { listParams, byIdParams } from './__param_builders.js';

/**
 * PaySalaryStructuresEndpoints — reusable salary grades/bands (base + components).
 */
export const PaySalaryStructuresEndpoints = {
    meta: {
        uid: 'api::pay-salary-structure.pay-salary-structure',
        domains: ['payroll'],
        roles: ['admin', 'manager'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-salary-structures',
        action: 'find',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/pay-salary-structures/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/pay-salary-structures',
        action: 'create',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/pay-salary-structures/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/pay-salary-structures/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['payroll'],
        approle: ['admin'],
    }),
};
