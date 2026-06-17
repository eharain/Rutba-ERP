import { listParams, byIdParams } from './__param_builders.js';

/**
 * PayEmployeeProfilesEndpoints — per-employee pay setup (pay type, bank,
 * statutory). Behind the payroll wall: payroll app only, never the hr app.
 */
export const PayEmployeeProfilesEndpoints = {
    meta: {
        uid: 'api::pay-employee-profile.pay-employee-profile',
        domains: ['payroll'],
        roles: ['admin', 'manager'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-employee-profiles',
        action: 'find',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { populate: ['employee', 'branch'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/pay-employee-profiles/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: byIdParams({ populate, fields }, { populate: ['employee', 'branch'] }),
    }),

    create: (data) => ({
        path: '/pay-employee-profiles',
        action: 'create',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/pay-employee-profiles/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/pay-employee-profiles/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['payroll'],
        approle: ['admin'],
    }),
};
