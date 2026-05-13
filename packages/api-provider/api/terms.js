import { listParams } from './__param_builders.js';

export const TermsEndpoints = {
    meta: {
        uid: 'api::term.term',
        domains: ['stock', 'sale'],
        roles: ['admin', 'manager', 'staff']
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/terms',
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

    /** Create a term. */
    create: (data) => ({
        path: '/terms',
        action: 'create',
        method: 'post',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Update a term. */
    update: (id, data) => ({
        path: `/terms/${id}`,
        action: 'update',
        method: 'put',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (id) => ({
        path: `/terms/${id}`,
        action: 'delete',
        method: 'delete',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager'],
    }),

};
