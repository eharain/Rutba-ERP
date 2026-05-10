export const ProductGroupsEndpoints = {
    meta: {
        uid: 'api::product-group.product-group',
        domains: ['stock', 'cms', 'web-public', 'web-authenticated', 'web-user'],
        roles: ['admin', 'manager', 'staff', 'public', 'user']
    },

    listDraft: ({ sort, populate, pagination } = {}) => ({
        path: '/product-groups',
        action: 'find',
        method: 'get',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            status: 'draft',
            sort: sort ?? ['createdAt:desc'],
            populate: populate ?? ['gallery', 'cover_image', 'products'],
            pagination: pagination ?? { pageSize: 50 },
        },
    }),

    listPublished: ({ pageSize = 200 } = {}) => ({
        path: '/product-groups',
        action: 'find',
        method: 'get',
        apps: ['stock', 'cms', 'web-public', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/product-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            status: 'draft',
            ...(populate ? { populate } : {}),
        },
    }),

    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/product-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock', 'cms', 'web-public', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
            ...(populate ? { populate } : {}),
        },
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