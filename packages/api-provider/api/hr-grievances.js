import { listParams, byIdParams } from './__param_builders.js';

export const HrGrievancesEndpoints = {
    meta: {
        uid: 'api::hr-grievance.hr-grievance',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    listMine: () => ({
        path: '/hr-grievances/mine',
        action: 'myGrievances',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    submit: (data) => ({
        path: '/hr-grievances/submit',
        action: 'submitGrievance',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    listQueue: () => ({
        path: '/hr-grievances/queue',
        action: 'grievanceQueue',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager'],
    }),

    resolve: (documentId, data) => ({
        path: `/hr-grievances/${documentId}/resolve`,
        action: 'resolveGrievance',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-grievances',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-grievances/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-grievances',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-grievances/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-grievances/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
