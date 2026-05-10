/**
 * NotificationTemplatesEndpoints
 * Path + params definitions for notification-template content API resources.
 */

export const NotificationTemplatesEndpoints = {
    meta: {
        uid: 'api::notification-template.notification-template',
        domains: ['auth', 'cms', 'sale', 'social'],
        roles: ['admin', 'manager', 'staff']
    },

    list: ({ sort, populate, pagination } = {}) => ({
        path: '/notification-templates',
        action: 'find',
        method: 'get',
        apps: ['auth', 'cms', 'sale', 'social'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            ...(sort ? { sort } : {}),
            ...(populate ? { populate } : {}),
            ...(pagination ? { pagination } : {}),
        },
    }),

    byId: (documentId, { populate } = {}) => ({
        path: `/notification-templates/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['auth', 'cms', 'sale', 'social'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            ...(populate ? { populate } : {}),
        },
    }),

    create: (data) => ({
        path: '/notification-templates',
        action: 'create',
        method: 'post',
        apps: ['auth', 'cms', 'sale', 'social'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/notification-templates/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['auth', 'cms', 'sale', 'social'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    remove: (documentId) => ({
        path: `/notification-templates/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['auth', 'cms', 'sale', 'social'],
        approle: ['admin', 'manager'],
    }),

};

/**
 * NotificationTemplatesEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const NotificationTemplatesEndpointRules = {
    /** GET /api/notification-templates — list */
    list: {
        injectSort: ['name:asc'],
    },

    /** GET /api/notification-templates/:id — byId */
    byId: {},

    /** POST /api/notification-templates */
    create: {},

    /** PUT /api/notification-templates/:id */
    update: {},

    /** DELETE /api/notification-templates/:id */
    delete: {},
};