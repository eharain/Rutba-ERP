/**
 * NotificationTemplatesEndpoints
 * Path + params definitions for notification-template content API resources.
 */

export const NotificationTemplatesEndpoints = {
    list: ({ sort, populate, pagination } = {}) => ({
        path: '/notification-templates',
        params: {
            ...(sort ? { sort } : {}),
            ...(populate ? { populate } : {}),
            ...(pagination ? { pagination } : {}),
        },
    }),

    byId: (documentId, { populate } = {}) => ({
        path: `/notification-templates/${documentId}`,
        params: {
            ...(populate ? { populate } : {}),
        },
    }),

    create: (data) => ({ path: '/notification-templates' , data }),

    update: (documentId, data) => ({ path: `/notification-templates/${documentId}` , data }),

    remove: (documentId) => ({ path: `/notification-templates/${documentId}` }),

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