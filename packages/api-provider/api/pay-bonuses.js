import { listParams, byIdParams } from './__param_builders.js';

export const PayBonusesEndpoints = {
    meta: {
        uid: 'api::pay-bonus.pay-bonus',
        domains: ['payroll', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** The caller's own bonuses (self-service). */
    listMine: () => ({
        path: '/pay-bonuses/mine',
        action: 'myBonuses',
        method: 'get',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    /** Bonuses for the caller's reports (payroll admin/manager org-wide / line manager -> reports). */
    listTeam: () => ({
        path: '/pay-bonuses/team',
        action: 'teamBonuses',
        method: 'get',
        apps: ['payroll', 'ess'],
        approle: ['admin', 'manager'],
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-bonuses',
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
        path: `/pay-bonuses/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/pay-bonuses',
        action: 'create',
        method: 'post',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/pay-bonuses/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['payroll'],
        approle: ['admin', 'manager'],
        data,
    }),
};
