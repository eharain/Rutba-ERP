import { listParams, byIdParams } from './__param_builders.js';

// Return-method content type drives the return-label provider in the same
// way delivery-method drives the forward-label provider. The CT itself has
// draftAndPublish disabled (small reference table, no need for staging) so
// we skip the publish helper.

export const ReturnMethodsEndpoints = {
    meta: {
        uid: 'api::return-method.return-method',
        domains: ['order-management', 'sale', 'web'],
        roles: ['admin', 'manager', 'staff', 'public', 'user'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/return-methods',
        action: 'find',
        method: 'get',
        apps: ['order-management', 'sale', 'web'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['priority:asc', 'createdAt:desc'], pageSize: 50 },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/return-methods/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['order-management', 'sale', 'web'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/return-methods',
        action: 'create',
        method: 'post',
        apps: ['order-management'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/return-methods/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['order-management'],
        approle: ['admin', 'manager'],
        data,
    }),
};
