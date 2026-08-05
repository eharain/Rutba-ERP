import { listParams, byIdParams } from './__param_builders.js';

export const HrRostersEndpoints = {
    meta: {
        uid: 'api::hr-roster.hr-roster',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** The caller's own upcoming/recent shift assignments (self-service). */
    listMine: () => ({
        path: '/hr-rosters/mine',
        action: 'myRoster',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-rosters',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['date:desc'], populate: ['employee', 'shift'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-rosters/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-rosters',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-rosters/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-rosters/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
    }),
};
