import { listParams, byIdParams } from './__param_builders.js';

export const HrBusinessUnitsEndpoints = {
    meta: {
        uid: 'api::hr-business-unit.hr-business-unit',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-business-units',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'], populate: ['company', 'division', 'parent'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-business-units/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),
};
