import { listParams, byIdParams } from './__param_builders.js';

export const PayAdvancesEndpoints = {
    meta: {
        uid: 'api::pay-advance.pay-advance',
        domains: ['payroll', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** The caller's own advances (self-service). */
    listMine: () => ({
        path: '/pay-advances/mine',
        action: 'myAdvances',
        method: 'get',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    /** Request a salary advance (self-service; employee forced to the caller). */
    request: (data) => ({
        path: '/pay-advances/request',
        action: 'requestAdvance',
        method: 'post',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    /** Pending advance requests the caller may decide (payroll admin/manager org-wide / line manager -> reports). */
    listTeam: () => ({
        path: '/pay-advances/team',
        action: 'teamAdvances',
        method: 'get',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager'],
    }),

    approve: (documentId) => ({
        path: `/pay-advances/${documentId}/approve`,
        action: 'approve',
        method: 'post',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager'],
    }),

    reject: (documentId, extra = {}) => ({
        path: `/pay-advances/${documentId}/reject`,
        action: 'reject',
        method: 'post',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager'],
        data: { ...extra },
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-advances',
        action: 'find',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['employee'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/pay-advances/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: byIdParams({ populate, fields }),
    }),
};
