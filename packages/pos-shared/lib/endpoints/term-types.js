import { authApi } from '../api.js';

/**
 * TermTypesEndpoints + TermsEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const TermTypesEndpoints = {
    /**
     * List variant term-types (is_variant = true) with their terms.
     * @param {{ page?, pageSize? }} opts
     */
    listVariants: ({ page = 1, pageSize = 500 } = {}) => ({
        path: '/term-types',
        params: {
            filters: { is_variant: true },
            populate: { terms: true },
            pagination: { page, pageSize },
            sort: ['name:asc'],
        },
    }),

    /**
     * List term-types with their terms populated.
     * @param {{ sort?, populate? }} opts
     */
    listWithTerms: ({ sort, populate } = {}) => ({
        path: '/term-types',
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { terms: true },
        },
    }),

    /**
     * List term-types (no populate).
     * @param {{ sort? }} opts
     */
    list: ({ sort } = {}) => ({
        path: '/term-types',
        params: { sort: sort ?? ['name:asc'] },
    }),

    /**
     * Create a term-type — body provided by caller as { data }.
     */
    create: () => ({ path: '/term-types' }),

    /**
     * Update a term-type by id/documentId — body provided by caller as { data }.
     * @param {string} id
     */
    update: (id) => ({ path: `/term-types/${id}` }),

    /** Async: fetch variant term-types with terms. */
    fetchVariants: (opts = {}) => {
        const ep = TermTypesEndpoints.listVariants(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch all term-types with terms. */
    fetchWithTerms: (opts = {}) => {
        const ep = TermTypesEndpoints.listWithTerms(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch term-types (no terms populate). */
    fetchList: (opts = {}) => {
        const ep = TermTypesEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: create a new term-type. */
    postCreate: (data) => authApi.post('/term-types', { data }),

    /** Async: update a term-type by id/documentId. */
    putUpdate: (id, data) => authApi.put(`/term-types/${id}`, { data }),

    /** Async: delete a term-type by id/documentId. */
    putDelete: (id) => authApi.del(`/term-types/${id}`),
};

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

    /** Async: update a term by id/documentId. */
    putUpdate: (id, data) => authApi.put(`/terms/${id}`, { data }),

    /** Async: delete a term by id/documentId. */
    putDelete: (id) => authApi.del(`/terms/${id}`),
};
