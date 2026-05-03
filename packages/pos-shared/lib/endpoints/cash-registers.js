import { authApi } from '../api.js';

/**
 * CashRegistersEndpoints
 * Centralised path + params definitions for /cash-registers and related custom routes.
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const CashRegistersEndpoints = {

    /**
     * Paginated list of cash registers with optional filters.
     * @param {{ filters?, sort?, page?, pageSize?, populate? }} opts
     */
    list: ({ filters, sort, page = 1, pageSize = 20, populate } = {}) => ({
        path: '/cash-registers',
        params: {
            ...(filters ? { filters } : {}),
            sort: sort ?? ['opened_at:desc'],
            pagination: { page, pageSize },
            ...(populate ? { populate } : {}),
        },
    }),

    /** Async: fetch paginated list of cash registers. */
    fetchList: (opts = {}) => {
        const ep = CashRegistersEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /**
     * Fetch a single cash register by documentId.
     * @param {string} documentId
     * @param {{ populate? }} opts
     */
    byId: (documentId, { populate } = {}) => ({
        path: `/cash-registers/${documentId}`,
        params: populate ? { populate } : undefined,
    }),

    /** Async: fetch a single cash register by documentId. */
    fetchById: (documentId, opts = {}) => {
        const ep = CashRegistersEndpoints.byId(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /**
     * Fetch the active cash register for a desk + user.
     * @param {{ deskId?, userId? }} opts
     */
    active: ({ deskId, userId } = {}) => {
        const params = new URLSearchParams();
        if (deskId) params.set('desk_id', deskId);
        if (userId) params.set('user_id', userId);
        const qs = params.toString();
        return { path: `/cash-registers/active${qs ? '?' + qs : ''}` };
    },

    /** Async: fetch the active cash register for a desk + user. */
    fetchActive: (opts = {}) => {
        const ep = CashRegistersEndpoints.active(opts);
        return authApi.fetch(ep.path);
    },

    /** Open a new cash register — body provided by caller as { data }. */
    open: () => ({ path: '/cash-registers/open' }),

    /**
     * Close a cash register by registerId.
     * @param {string} registerId
     */
    close: (registerId) => ({ path: `/cash-registers/${registerId}/close` }),
};


    /**
     * Paginated list of cash registers with optional filters.
     * @param {{ filters?, sort?, page?, pageSize?, populate? }} opts
     */
    list: ({ filters, sort, page = 1, pageSize = 20, populate } = {}) => ({
        path: '/cash-registers',
        params: {
            ...(filters ? { filters } : {}),
            sort: sort ?? ['opened_at:desc'],
            pagination: { page, pageSize },
            ...(populate ? { populate } : {}),
        },
    }),

    /**
     * Fetch a single cash register by documentId.
     * @param {string} documentId
     * @param {{ populate? }} opts
     */
    byId: (documentId, { populate } = {}) => ({
        path: `/cash-registers/${documentId}`,
        params: populate ? { populate } : undefined,
    }),

    /**
     * Fetch the active cash register for a desk + user.
     * @param {{ deskId?, userId? }} opts
     */
    active: ({ deskId, userId } = {}) => {
        const params = new URLSearchParams();
        if (deskId) params.set('desk_id', deskId);
        if (userId) params.set('user_id', userId);
        const qs = params.toString();
        return { path: `/cash-registers/active${qs ? '?' + qs : ''}` };
    },

    /** Open a new cash register — body provided by caller as { data }. */
    open: () => ({ path: '/cash-registers/open' }),

    /**
     * Close a cash register by registerId.
     * @param {string} registerId
     */
    close: (registerId) => ({ path: `/cash-registers/${registerId}/close` }),
};
