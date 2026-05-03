import { authApi } from '../api.js';

/**
 * BranchesEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const BranchesEndpoints = {

    /**
     * List all branches with their desks and currency populated.
     * Replaces the qs-string path: /branches?populate[0]=desks&populate[1]=currency
     */
    listWithDesks: () => ({
        path: '/branches',
        params: {
            populate: { desks: true, currency: true },
        },
    }),

    /**
     * Simple list of branches (no nested populate).
     * Used by selectors and dropdowns.
     * @param {{ sort?, populate? }} opts
     */
    list: ({ sort, populate } = {}) => ({
        path: '/branches',
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? true,
        },
    }),

    /**
     * Fetch a single branch by documentId with desks and currency populated.
     * @param {string} documentId
     */
    byId: (documentId) => ({
        path: `/branches/${documentId}`,
        params: { populate: { desks: true, currency: true } },
    }),

    /**
     * Update a branch by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/branches/${documentId}` }),

    /** Async: fetch branches list. */
    fetchList: (opts = {}) => {
        const ep = BranchesEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch a single branch by documentId. */
    fetchById: (documentId) => {
        const ep = BranchesEndpoints.byId(documentId);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch branches with desks and currency. */
    fetchWithDesks: () => {
        const ep = BranchesEndpoints.listWithDesks();
        return authApi.fetch(ep.path, ep.params);
    },
};
