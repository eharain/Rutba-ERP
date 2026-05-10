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
    create: (data) => ({ path: '/crm-leads' , data }),

    /**
     * Descriptor: update a CRM lead by documentId.
     * @param {string} documentId
     */
    update: (documentId, data) => ({ path: `/crm-leads/${documentId}` , data }),

};

