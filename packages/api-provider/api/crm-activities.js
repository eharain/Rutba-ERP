/**
 * CrmActivitiesEndpoints
 * Centralised path + params definitions for /crm-activities.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CrmActivitiesEndpoints = {

    meta: {
        uid: 'api::crm-activity.crm-activity',
        domains: ['crm'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/crm-activities',
        action: 'find',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['date:desc'], populate: ['contact'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/crm-activities/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    /** Descriptor: log a CRM activity (call, email, meeting, note, follow-up). */
    create: (data) => ({
        path: '/crm-activities',
        action: 'create',
        method: 'post',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Descriptor: update a CRM activity by documentId.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/crm-activities/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Descriptor: delete a CRM activity by documentId. */
    del: (documentId) => ({
        path: `/crm-activities/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['crm'],
        approle: ['admin', 'manager'],
    }),

};
