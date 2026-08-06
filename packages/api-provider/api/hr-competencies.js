import { listParams, byIdParams } from './__param_builders.js';

export const HrCompetenciesEndpoints = {
    meta: {
        uid: 'api::hr-competency.hr-competency',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-competencies',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-competencies/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-competencies',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-competencies/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-competencies/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
