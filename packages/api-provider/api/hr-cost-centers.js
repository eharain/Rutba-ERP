import { listParams, byIdParams } from './__param_builders.js';

export const HrCostCentersEndpoints = {
    meta: {
        uid: 'api::hr-cost-center.hr-cost-center',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-cost-centers',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'], populate: ['company', 'business_unit', 'parent'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-cost-centers/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),
};
