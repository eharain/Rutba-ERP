import { listParams, byIdParams } from './__param_builders.js';

export const HrBenefitEnrollmentsEndpoints = {
    meta: {
        uid: 'api::hr-benefit-enrollment.hr-benefit-enrollment',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** The caller's own benefit enrollments (self-service). */
    listMine: () => ({
        path: '/hr-benefit-enrollments/mine',
        action: 'myEnrollments',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-benefit-enrollments',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['employee', 'benefit_plan'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-benefit-enrollments/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-benefit-enrollments',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-benefit-enrollments/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
};
