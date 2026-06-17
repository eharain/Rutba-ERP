import { listParams } from './__param_builders.js';

export const HrTeamsEndpoints = {
    meta: {
        uid: 'api::hr-team.hr-team',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-teams',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

    // Method name must start with a whitelisted verb (get…) so the seeder mints
    // a policy; the route handler's trailing action segment is `appRoleOptions`.
    getAppRoleOptions: () => ({
        path: '/hr-teams/app-role-options',
        action: 'appRoleOptions',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
    }),

    create: (data) => ({
        path: '/hr-teams',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-teams/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
};
