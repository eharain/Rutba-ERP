import { listParams, byIdParams } from './__param_builders.js';

export const HrComplianceItemsEndpoints = {
    meta: {
        uid: 'api::hr-compliance-item.hr-compliance-item',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    listMine: () => ({
        path: '/hr-compliance-items/mine',
        action: 'myComplianceItems',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    listExpiring: () => ({
        path: '/hr-compliance-items/expiring',
        action: 'expiringItems',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager'],
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-compliance-items',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['expiry_date:asc'], populate: ['employee'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-compliance-items/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-compliance-items',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-compliance-items/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-compliance-items/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
