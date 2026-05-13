import { listParams } from './__param_builders.js';

export const DeliveryZonesEndpoints = {
    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/delivery-zones',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], pageSize: 200 },
        ),
    }),
    create: (data) => ({ path: '/delivery-zones' , data }),

};