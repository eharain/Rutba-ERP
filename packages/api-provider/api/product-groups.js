import { listParams, byIdParams } from './__param_builders.js';

export const ProductGroupsEndpoints = {
    meta: {
        uid: 'api::product-group.product-group',
        domains: ['cms', 'stock', 'web', 'web-user'],
        roles: ['admin', 'manager', 'staff', 'public', 'user']
    },

    listDraft: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/product-groups',
        action: 'find',
        method: 'get',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['gallery', 'cover_image', 'products'], pageSize: 50 },
            { status: 'draft' },
        ),
    }),

    listPublished: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/product-groups',
        action: 'find',
        method: 'get',
        apps: ['stock', 'cms', 'web', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { pageSize: 200, fields: ['documentId'] },
            { status: 'published' },
        ),
    }),

    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/product-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }, {}, { status: 'draft' }),
    }),

    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/product-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock', 'cms', 'web', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: byIdParams({ populate, fields }, {}, { status: 'published' }),
    }),

    create: (data) => ({
        path: '/product-groups',
        action: 'create',
        method: 'post',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    updateDraft: (documentId, data) => ({
        path: `/product-groups/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager', 'staff'],
        params: { status: 'draft' },
        data,
    }),
    publish: (documentId) => ({
        path: `/product-groups/${documentId}/publish`,
        action: 'publish',
        method: 'post',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager'],
    }),
    unpublish: (documentId) => ({
        path: `/product-groups/${documentId}/unpublish`,
        action: 'unpublish',
        method: 'post',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager'],
    }),
    del: (documentId) => ({
        path: `/product-groups/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['stock', 'cms'],
        approle: ['admin'],
    }),

};