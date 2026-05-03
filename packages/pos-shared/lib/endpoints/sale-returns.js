import { authApi } from '../api.js';

/**
 * SaleReturnsEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const SaleReturnsEndpoints = {

    /**
     * List sale returns with pagination.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, filters?, populate? }} opts
     */
    list: (page = 1, pageSize = 100, { sort, filters, populate } = {}) => ({
        path: '/sale-returns',
        params: {
            sort: sort ?? ['createdAt:desc'],
            filters: filters ?? undefined,
            pagination: { page, pageSize },
            populate: populate ?? undefined,
        },
    }),

    /** Create a new sale return — body provided by caller as { data }. */
    create: () => ({ path: '/sale-returns' }),

    /**
     * Fetch a single sale return by documentId with full populate.
     * @param {string} documentId
     */
    byId: (documentId) => ({
        path: `/sale-returns/${documentId}`,
        params: {
            populate: {
                sale: { populate: { customer: true } },
                items: { populate: { product: true, items: true } },
                payments: true,
                cash_register: true,
                returned_by_user: true,
            },
        },
    }),

    /**
     * Update a sale return by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/sale-returns/${documentId}` }),

    /**
     * Publish a sale return (draft → published).
     * @param {string} documentId
     */
    publish: (documentId) => ({ path: `/sale-returns/${documentId}/publish` }),

    /**
     * Unpublish a sale return.
     * @param {string} documentId
     */
    unpublish: (documentId) => ({ path: `/sale-returns/${documentId}/unpublish` }),

    /** Async: fetch paginated list of sale returns. */
    fetchList: (page, pageSize, opts = {}) => {
        const ep = SaleReturnsEndpoints.list(page, pageSize, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch a single sale return by documentId. */
    fetchById: (documentId) => {
        const ep = SaleReturnsEndpoints.byId(documentId);
        return authApi.fetch(ep.path, ep.params);
    },
};
