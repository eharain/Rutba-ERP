import { listParams, byIdParams } from './__param_builders.js';

/** Plans are read broadly (hr + ess: employees pick from these when self-enrolling in future); writes stay HR-only. */
export const HrBenefitPlansEndpoints = {
    meta: {
        uid: 'api::hr-benefit-plan.hr-benefit-plan',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-benefit-plans',
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
        path: `/hr-benefit-plans/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-benefit-plans',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-benefit-plans/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),
};
