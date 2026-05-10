/**
 * CashRegistersEndpoints
 * Centralised path + params definitions for /cash-registers and related custom routes.
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
    // Backward-compatible aliases expected by existing consumers
    fetchActive: ({ deskId, userId } = {}) => {
        const params = new URLSearchParams();
        if (deskId) params.set('desk_id', deskId);
        if (userId) params.set('user_id', userId);
        const qs = params.toString();
        return { path: `/cash-registers/active${qs ? '?' + qs : ''}` };
    },
/** Open a new cash register — body provided by caller as { data }. */
    open: (data) => ({ path: '/cash-registers/open' }),
    postOpen: (data) => ({ path: '/cash-registers/open', data }),

    /**
     * Close a cash register by registerId.
     * @param {string} registerId
     */
    close: (registerId) => ({ path: `/cash-registers/${registerId}/close` }),
    postClose: (registerId, data) => ({ path: `/cash-registers/${registerId}/close`, data }),
/**
     * Async: close a cash register.
     * @param {string} registerId
     * @param {object} data
     */

};
