/**
 * NotificationTemplatesEndpoints
 * Path + params definitions for notification-template content API resources.
 */

import { authApi } from '../lib/api.js';

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

    create: () => ({ path: '/notification-templates' }),

    update: (documentId) => ({ path: `/notification-templates/${documentId}` }),

    remove: (documentId) => ({ path: `/notification-templates/${documentId}` }),

    fetchList: (opts = {}) => {
        const ep = NotificationTemplatesEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    fetchById: (documentId, opts = {}) => {
        const ep = NotificationTemplatesEndpoints.byId(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    postCreate: (data) => {
        const ep = NotificationTemplatesEndpoints.create();
        return authApi.post(ep.path, { data });
    },

    putUpdate: (documentId, data) => {
        const ep = NotificationTemplatesEndpoints.update(documentId);
        return authApi.put(ep.path, { data });
    },

    deleteById: (documentId) => {
        const ep = NotificationTemplatesEndpoints.remove(documentId);
        return authApi.del(ep.path);
    },
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
