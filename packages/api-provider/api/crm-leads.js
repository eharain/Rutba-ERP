/**
 * CrmLeadsEndpoints
 * Centralised path + params definitions for /crm-leads.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CrmLeadsEndpoints = {

    meta: {
        uid: 'api::crm-lead.crm-lead',
        domains: ['crm'],
        roles: ['admin', 'manager', 'staff']
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/crm-leads',
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
        path: `/crm-leads/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    /** Descriptor: create a CRM lead. */
    create: (data) => ({
        path: '/crm-leads',
        action: 'create',
        method: 'post',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Descriptor: update a CRM lead by documentId.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/crm-leads/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

};

