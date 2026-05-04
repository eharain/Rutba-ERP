import { authApi } from '../api.js';
import { buildEndpointMeta } from './access-metadata.js';

/**
 * CrmLeadsEndpoints
 * Centralised path + params definitions for /crm-leads.
 * Each `fetch*`/`post*`/`put*` method owns the full async call.
 */
export const CrmLeadsEndpoints = {

    /** Descriptor: create a CRM lead. */
    create: () => ({ path: '/crm-leads' }),

    /**
     * Descriptor: update a CRM lead by documentId.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/crm-leads/${documentId}` }),

    /** Async: create a new CRM lead. */
    postCreate: (data) => authApi.post('/crm-leads', { data }),

    /** Async: update a CRM lead by documentId. */
    putUpdate: (documentId, data) => authApi.put(`/crm-leads/${documentId}`, { data }),
};

export const CrmLeadsEndpointsMeta = buildEndpointMeta('api::crm-lead.crm-lead', '/crm-leads', {
    create: 'create',
    update: 'update',
});
