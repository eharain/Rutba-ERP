import { api, authApi } from '../lib/api.js';
import { AuthApiEndpoints } from './http-client.js';
import { dataNode } from '../pos/search.js';

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
    fetchListWithDesks: () => {
        const ep = BranchesEndpoints.listWithDesks();
        return api.get(ep.path, ep.params);
    },

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

    /** Async: update a branch by documentId. */
    putUpdate: (documentId, data) => {
        const ep = BranchesEndpoints.update(documentId);
        return authApi.put(ep.path, { data });
    },

    /** Async: fetch archive statistics for a branch. */
    fetchArchiveStats: (branchDocumentId) => authApi.get(`/branches/${branchDocumentId}/archive-stats`),

    /** Async: archive stock items for a branch. */
    postArchiveStock: (branchDocumentId, data) => {
        return authApi.post(`/branches/${branchDocumentId}/archive-stock`, data);
    },

    /** Async: unarchive (restore) stock items for a branch. */
    postUnarchiveStock: (branchDocumentId, data) => {
        return authApi.post(`/branches/${branchDocumentId}/unarchive-stock`, data);
    },
};

export const BranchesEndpointsMeta = {
    uid: 'api::branch.branch',
    basePath: '/branches',
    methodActions: {
        listWithDesks: 'find',
        list: 'find',
        byId: 'findOne',
        update: 'update',
        postArchiveStock: 'update',
        postUnarchiveStock: 'update',
    },
};

/**
 * BranchesEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const BranchesEndpointRules = {
    /** GET /api/branches — list with desks/bank populate */
    listWithDesks: {
        injectPopulate: { desks: true, bank_accounts: true },
    },

    /** GET /api/branches — list (minimal) */
    list: {},

    /** GET /api/branches/:id — byId with full detail */
    byId: {
        injectPopulate: { desks: true, bank_accounts: true, logo: true },
    },

    /** PUT /api/branches/:id — update */
    update: {},

    /** POST /api/branches/:id/archive-stock — archive */
    archiveStock: {},

    /** POST /api/branches/:id/unarchive-stock — unarchive */
    unarchiveStock: {},
};





/**
 * Search branches by name or code.
 * @param {string} searchTerm
 * @param {number} page
 * @param {number} rowsPerPage
 */
export async function searchBranches(searchTerm, page = 1, rowsPerPage = 5) {
    const hasSearch = searchTerm && searchTerm.trim().length > 0;
    const qs = (await import('qs')).default;
    const query = {
        populate: ['logo', 'gallery', 'currency', { categories: { populate: ['logo', 'gallery'] } }],
        pagination: { page, pageSize: rowsPerPage },
        ...(hasSearch && {
            filters: {
                $or: [
                    { name: { $containsi: searchTerm } },
                    { code: { $eq: searchTerm } },
                ],
            },
        }),
    };
    const res = await AuthApiEndpoints.fetch(`/branches?${qs.stringify(query, { encodeValuesOnly: true })}`);
    return dataNode(res);
}