import { listParams, byIdParams } from './__param_builders.js';

export const HrTrainingEnrollmentsEndpoints = {
    meta: {
        uid: 'api::hr-training-enrollment.hr-training-enrollment',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    listMine: () => ({
        path: '/hr-training-enrollments/mine',
        action: 'myTrainings',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    enroll: (data) => ({
        path: '/hr-training-enrollments/enroll',
        action: 'enrollMe',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    complete: (documentId, data) => ({
        path: `/hr-training-enrollments/${documentId}/complete`,
        action: 'markComplete',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager'],
        data,
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-training-enrollments',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['employee', 'session'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-training-enrollments/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-training-enrollments',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-training-enrollments/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-training-enrollments/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
