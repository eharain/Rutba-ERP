/**
 * CrmLeadsEndpoints
 * Centralised path + params definitions for /crm-leads.
 * Each `fetch*`/`post*`/`put*` method owns the full async call.
 */
export const CrmLeadsEndpoints = {

    meta: {
        uid: 'api::crm-lead.crm-lead',
        domains: ['crm'],
        roles: ['admin', 'manager', 'staff']
    },

    list: ({ sort, populate } = {}) => ({
        path: '/crm-leads',
        action: 'find',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['createdAt:desc'],
            ...(populate ? { populate } : {}),
        },
    }),

    byId: (documentId, params = {}) => ({
        path: `/crm-leads/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params,
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

