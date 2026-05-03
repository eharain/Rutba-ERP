import { authApi } from '../api.js';

/**
 * CustomersEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const CustomersEndpoints = {

    /**
     * Look up a customer by exact email or phone (duplicate check).
     * @param {{ email?, phone? }} opts
     */
    findByContact: ({ email, phone } = {}) => ({
        path: '/customers',
        params: {
            filters: {
                ...(email ? { email: { $eq: email } } : {}),
                ...(phone ? { phone: { $eq: phone } } : {}),
            },
            pagination: { pageSize: 1 },
        },
    }),

    /** Create a new customer — body provided by caller as { data }. */
    create: () => ({ path: '/customers' }),

    /**
     * Search customers by name or phone (case-insensitive contains).
     * @param {string} q  search term
     * @param {number} pageSize
     */
    search: (q, pageSize = 10) => ({
        path: '/customers',
        params: {
            filters: {
                $or: [
                    { name: { $containsi: q } },
                    { phone: { $containsi: q } },
                ],
            },
            pagination: { pageSize },
        },
    }),

    /**
     * Update a customer by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/customers/${documentId}` }),

    /** Async: search customers by name or phone. */
    fetchSearch: (q, pageSize = 10) => {
        const ep = CustomersEndpoints.search(q, pageSize);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: find customer by exact email or phone. */
    fetchByContact: (opts = {}) => {
        const ep = CustomersEndpoints.findByContact(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};
