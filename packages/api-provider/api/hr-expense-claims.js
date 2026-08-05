import { listParams, byIdParams } from './__param_builders.js';

export const HrExpenseClaimsEndpoints = {
    meta: {
        uid: 'api::hr-expense-claim.hr-expense-claim',
        domains: ['hr', 'payroll', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** The caller's own claims (self-service). */
    listMine: () => ({
        path: '/hr-expense-claims/mine',
        action: 'myClaims',
        method: 'get',
        apps: ['hr', 'payroll', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    /** Submit a claim (self-service; employee forced to the caller). */
    submit: (data) => ({
        path: '/hr-expense-claims/submit',
        action: 'submitClaim',
        method: 'post',
        apps: ['hr', 'payroll', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    /** Pending claims the caller may decide (payroll admin/manager org-wide / line manager -> reports). */
    listTeam: () => ({
        path: '/hr-expense-claims/team',
        action: 'teamClaims',
        method: 'get',
        apps: ['hr', 'payroll', 'ess'],
        approle: ['admin', 'manager'],
    }),

    approve: (documentId) => ({
        path: `/hr-expense-claims/${documentId}/approve`,
        action: 'approve',
        method: 'post',
        apps: ['hr', 'payroll', 'ess'],
        approle: ['admin', 'manager'],
    }),

    reject: (documentId, extra = {}) => ({
        path: `/hr-expense-claims/${documentId}/reject`,
        action: 'reject',
        method: 'post',
        apps: ['hr', 'payroll', 'ess'],
        approle: ['admin', 'manager'],
        data: { ...extra },
    }),

    /** Finance marks a claim reimbursed and posts the payout journal entry. */
    reimburse: (documentId) => ({
        path: `/hr-expense-claims/${documentId}/reimburse`,
        action: 'reimburse',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin'],
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-expense-claims',
        action: 'find',
        method: 'get',
        apps: ['hr', 'payroll'],
        approle: ['admin', 'manager'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['employee'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-expense-claims/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr', 'payroll'],
        approle: ['admin', 'manager'],
        params: byIdParams({ populate, fields }),
    }),
};
