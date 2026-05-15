import { listParams } from './__param_builders.js';

export const HrTeamsEndpoints = {
    meta: { domains: ['hr'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-teams',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

    appRoleOptions: () => ({ path: '/hr-teams/app-role-options' }),
    create: (data) => ({ path: '/hr-teams', method: 'post', data }),
    update: (documentId, data) => ({ path: `/hr-teams/${documentId}`, method: 'put', data }),

};