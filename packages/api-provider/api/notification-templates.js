/**
 * NotificationTemplatesEndpoints
 * Path + params definitions for notification-template content API resources.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const NotificationTemplatesEndpoints = {
    meta: {
        uid: 'api::notification-template.notification-template',
        domains: ['auth', 'cms', 'sale', 'social'],
        roles: ['admin', 'manager', 'staff']
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/notification-templates',
        action: 'find',
        method: 'get',
        apps: ['auth', 'cms', 'sale', 'social'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams({ page, pageSize, sort, populate, filters, fields }),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/notification-templates/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['auth', 'cms', 'sale', 'social'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
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
