/**
 * CrmContactsEndpoints
 * Centralised path + params definitions for /crm-contacts.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CrmContactsEndpoints = {

    meta: {
        uid: 'api::crm-contact.crm-contact',
        domains: ['crm'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/crm-contacts',
        action: 'find',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/crm-contacts/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    /** Descriptor: create a CRM contact. */
    create: (data) => ({
        path: '/crm-contacts',
        action: 'create',
        method: 'post',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Descriptor: update a CRM contact by documentId.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/crm-contacts/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Descriptor: delete a CRM contact by documentId. */
    del: (documentId) => ({
        path: `/crm-contacts/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['crm'],
        approle: ['admin', 'manager'],
    }),

};
