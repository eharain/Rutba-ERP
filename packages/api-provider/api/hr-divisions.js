import { listParams, byIdParams } from './__param_builders.js';

export const HrDivisionsEndpoints = {
    meta: {
        uid: 'api::hr-division.hr-division',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-divisions',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'], populate: ['company', 'parent'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-divisions/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),
};
