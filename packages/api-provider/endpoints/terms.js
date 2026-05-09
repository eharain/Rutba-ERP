import { authApi } from '../lib/api.js';

export const TermsEndpoints = {
    /**
     * List terms.
     * @param {{ sort?, filters? }} opts
     */
    list: ({ sort, filters } = {}) => ({
        path: '/terms',
        params: {
            sort: sort ?? ['name:asc'],
            ...(filters ? { filters } : {}),
        },
    }),

    /** Create a term — body provided by caller as { data }. */
    create: () => ({ path: '/terms' }),

    /**
     * Update a term — body provided by caller as { data }.
     * @param {string} id
     */
    update: (id) => ({ path: `/terms/${id}` }),

    /** Async: fetch terms with optional filters. */
    fetchList: (opts = {}) => {
        const ep = TermsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: create a new term. */
    postCreate: (data) => authApi.post('/terms', { data }),

    /** Async: create a term by endpoint helper. */
    createTerm: (data) => authApi.post('/terms', { data }),

    /** Async: update a term by id/documentId. */
    putUpdate: (id, data) => authApi.put(`/terms/${id}`, { data }),

    /** Async: delete a term by id/documentId. */
    putDelete: (id) => authApi.del(`/terms/${id}`),
};

/**
 * TermsEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const TermsEndpointRules = {
    /** GET /api/terms — list */
    list: {
        injectPopulate: { term_type: true },
        injectSort: ['name:asc'],
    },

    /** POST /api/terms */
    create: {},

    /** PUT /api/terms/:id */
    update: {},

    /** DELETE /api/terms/:id */
    delete: {},
};
