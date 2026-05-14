/**
 * TermTypesEndpoints
 * Pure endpoint descriptors for the /term-types resource.
 */
import { listParams } from './__param_builders.js';

export const TermTypesEndpoints = {
    meta: {
        uid: 'api::term-type.term-type',
        domains: ['cms', 'order-management', 'sale', 'stock'],
        roles: ['admin', 'manager', 'staff']
    },

    listVariants: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/term-types',
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            {
                sort: ['name:asc'],
                pageSize: 500,
                populate: { terms: true },
                filters: { is_variant: true },
            },
        ),
    }),

    listWithTerms: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/term-types',
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'], populate: { terms: true } },
        ),
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/term-types',
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

    /** Create a term-type. */
    create: (data) => ({
        path: '/term-types',
        action: 'create',
        method: 'post',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Update a term-type by id/documentId. */
    update: (id, data) => ({
        path: `/term-types/${id}`,
        action: 'update',
        method: 'put',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (id) => ({
        path: `/term-types/${id}`,
        action: 'delete',
        method: 'delete',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager'],
    }),

};

