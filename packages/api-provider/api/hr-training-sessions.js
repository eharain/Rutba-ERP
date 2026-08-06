import { listParams, byIdParams } from './__param_builders.js';

export const HrTrainingSessionsEndpoints = {
    meta: {
        uid: 'api::hr-training-session.hr-training-session',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-training-sessions',
        action: 'find',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['start_date:desc'], populate: ['course'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-training-sessions/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-training-sessions',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-training-sessions/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-training-sessions/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
