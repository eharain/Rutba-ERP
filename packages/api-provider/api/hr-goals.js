import { listParams, byIdParams } from './__param_builders.js';

export const HrGoalsEndpoints = {
    meta: {
        uid: 'api::hr-goal.hr-goal',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    listMine: () => ({
        path: '/hr-goals/mine',
        action: 'myGoals',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    updateMine: (documentId, data) => ({
        path: `/hr-goals/mine/${documentId}`,
        action: 'updateMyGoal',
        method: 'put',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-goals',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['target_date:asc'], populate: ['cycle'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-goals/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-goals',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-goals/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-goals/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
