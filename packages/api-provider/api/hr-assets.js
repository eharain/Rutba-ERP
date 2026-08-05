import { listParams, byIdParams } from './__param_builders.js';

export const HrAssetsEndpoints = {
    meta: {
        uid: 'api::hr-asset.hr-asset',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-assets',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-assets/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-assets',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-assets/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    /** Assign this asset to an employee — creates the assignment row and flips the asset to Assigned. */
    assign: (documentId, data) => ({
        path: `/hr-assets/${documentId}/assign`,
        action: 'assign',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),
};
