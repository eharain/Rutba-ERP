import { listParams, byIdParams } from './__param_builders.js';

export const HrOffersEndpoints = {
    meta: {
        uid: 'api::hr-offer.hr-offer',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-offers',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['offer_date:desc'], populate: ['candidate', 'requisition'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-offers/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-offers',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-offers/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-offers/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
