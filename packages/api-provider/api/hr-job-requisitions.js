import { listParams, byIdParams } from './__param_builders.js';

export const HrJobRequisitionsEndpoints = {
    meta: {
        uid: 'api::hr-job-requisition.hr-job-requisition',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-job-requisitions',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['department', 'position'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-job-requisitions/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-job-requisitions',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-job-requisitions/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-job-requisitions/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
