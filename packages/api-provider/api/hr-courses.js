import { listParams, byIdParams } from './__param_builders.js';

export const HrCoursesEndpoints = {
    meta: {
        uid: 'api::hr-course.hr-course',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-courses',
        action: 'find',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-courses/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-courses',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-courses/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-courses/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
