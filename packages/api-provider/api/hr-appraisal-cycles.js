import { listParams, byIdParams } from './__param_builders.js';

export const HrAppraisalCyclesEndpoints = {
    meta: {
        uid: 'api::hr-appraisal-cycle.hr-appraisal-cycle',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-appraisal-cycles',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['start_date:desc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-appraisal-cycles/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-appraisal-cycles',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-appraisal-cycles/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-appraisal-cycles/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
