import { listParams, byIdParams } from './__param_builders.js';

export const HrAppraisalsEndpoints = {
    meta: {
        uid: 'api::hr-appraisal.hr-appraisal',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    listMine: () => ({
        path: '/hr-appraisals/mine',
        action: 'myAppraisals',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    listTeam: () => ({
        path: '/hr-appraisals/team',
        action: 'teamAppraisals',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager'],
    }),

    submitSelfAssessment: (documentId, data) => ({
        path: `/hr-appraisals/${documentId}/self-assessment`,
        action: 'submitSelfAssessment',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    submitManagerReview: (documentId, data) => ({
        path: `/hr-appraisals/${documentId}/manager-review`,
        action: 'submitManagerReview',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager'],
        data,
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-appraisals',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['employee', 'cycle'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-appraisals/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-appraisals',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-appraisals/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-appraisals/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
