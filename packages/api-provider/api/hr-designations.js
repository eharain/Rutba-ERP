import { listParams, byIdParams } from './__param_builders.js';

export const HrDesignationsEndpoints = {
    meta: {
        uid: 'api::hr-designation.hr-designation',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-designations',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'], populate: ['job_grade'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-designations/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),
};
