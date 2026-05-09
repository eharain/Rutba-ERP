import { authApi } from '../lib/api.js';

/**
 * CrmLeadsEndpoints
 * Centralised path + params definitions for /crm-leads.
 * Each `fetch*`/`post*`/`put*` method owns the full async call.
 */
export const CrmLeadsEndpoints = {

    list: ({ sort, populate } = {}) => ({
        path: '/crm-leads',
        params: {
            sort: sort ?? ['createdAt:desc'],
            ...(populate ? { populate } : {}),
        },
    }),

    byId: (documentId, params = {}) => ({ path: `/crm-leads/${documentId}`, params }),

    /** Descriptor: create a CRM lead. */
    create: () => ({ path: '/crm-leads' }),

    /**
     * Descriptor: update a CRM lead by documentId.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/crm-leads/${documentId}` }),

    fetchList: (opts = {}) => {
        const ep = CrmLeadsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    fetchById: (documentId, params = {}) => {
        const ep = CrmLeadsEndpoints.byId(documentId, params);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: create a new CRM lead. */
    postCreate: (data) => authApi.post('/crm-leads', { data }),

    /** Async: update a CRM lead by documentId. */
    putUpdate: (documentId, data) => authApi.put(`/crm-leads/${documentId}`, { data }),
};

/**
 * CrmLeadsEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const CrmLeadsEndpointRules = {
    /** POST /api/crm-leads */
    create: {},

    /** PUT /api/crm-leads/:id */
    update: {},
};



