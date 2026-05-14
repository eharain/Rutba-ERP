import { listParams } from './__param_builders.js';

export const DeliveryZonesEndpoints = {
    meta: {
        uid: 'api::delivery-zone.delivery-zone',
        domains: ['cms', 'order-management', 'web', 'web-user'],
        roles: ['admin', 'manager', 'staff', 'public', 'user'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/delivery-zones',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], pageSize: 200 },
        ),
    }),
    create: (data) => ({ path: '/delivery-zones' , data }),

};