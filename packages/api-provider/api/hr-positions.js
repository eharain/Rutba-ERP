import { listParams, byIdParams } from './__param_builders.js';

export const HrPositionsEndpoints = {
    meta: {
        uid: 'api::hr-position.hr-position',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-positions',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['title:asc'], populate: ['designation', 'department', 'job_grade', 'reports_to_position'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-positions/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),
};
