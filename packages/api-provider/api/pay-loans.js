import { listParams, byIdParams } from './__param_builders.js';

export const PayLoansEndpoints = {
    meta: {
        uid: 'api::pay-loan.pay-loan',
        domains: ['payroll', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** The caller's own loans (self-service). */
    listMine: () => ({
        path: '/pay-loans/mine',
        action: 'myLoans',
        method: 'get',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    /** Apply for a loan (self-service; employee forced to the caller). */
    request: (data) => ({
        path: '/pay-loans/request',
        action: 'requestLoan',
        method: 'post',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    /** Pending loan requests the caller may decide (payroll admin/manager org-wide / line manager -> reports). */
    listTeam: () => ({
        path: '/pay-loans/team',
        action: 'teamLoans',
        method: 'get',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager'],
    }),

    approve: (documentId) => ({
        path: `/pay-loans/${documentId}/approve`,
        action: 'approve',
        method: 'post',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager'],
    }),

    reject: (documentId, extra = {}) => ({
        path: `/pay-loans/${documentId}/reject`,
        action: 'reject',
        method: 'post',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager'],
        data: { ...extra },
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-loans',
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
        path: `/pay-loans/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: byIdParams({ populate, fields }),
    }),
};
