import { listParams } from './__param_builders.js';

export const RidersEndpoints = {
    meta: {
        uid: 'api::rider.rider',
        domains: ['delivery', 'order-management', 'rider'],
        roles: ['admin', 'manager', 'staff']
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/riders',
        action: 'find',
        method: 'get',
        apps: ['rider', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['assigned_zones', 'user'], pageSize: 200 },
        ),
    }),
    create: (data) => ({
        path: '/riders',
        action: 'create',
        method: 'post',
        apps: ['rider', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    update: (documentId, data) => ({
        path: `/riders/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['rider', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

};