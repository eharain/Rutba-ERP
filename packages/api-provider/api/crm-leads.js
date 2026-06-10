/**
 * CrmLeadsEndpoints
 * Centralised path + params definitions for /crm-leads.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CrmLeadsEndpoints = {

    meta: {
        uid: 'api::crm-lead.crm-lead',
        domains: ['crm', 'sale'],
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

    /** Descriptor: delete a CRM lead by documentId. */
    del: (documentId) => ({
        path: `/crm-leads/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['crm'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Descriptor: list users holding a CRM app-role (lead assignee picker).
     * Custom route — returns [{ id, documentId, username, email }].
     */
    listAssignees: () => ({
        path: '/crm-leads/assignees',
        // action must equal the Strapi route handler's action name
        // ('api::crm-lead.crm-lead.assignees') — the api-pro interceptor
        // matches policies on it, not on the path.
        action: 'assignees',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
    }),

};

