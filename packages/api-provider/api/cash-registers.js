/**
 * CashRegistersEndpoints
 * Centralised path + params definitions for /cash-registers and related custom routes.
 */
export const CashRegistersEndpoints = {

    meta: {
        uid: 'api::cash-register.cash-register',
        domains: ['accounts', 'sale', 'accounts-viewer', 'auth'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * Paginated list of cash registers with optional filters.
     * @param {{ filters?, sort?, page?, pageSize?, populate? }} opts
     */
    list: ({ filters, sort, page = 1, pageSize = 20, populate } = {}) => ({
        path: '/cash-registers',
        action: 'find',
        method: 'get',
        apps: ['accounts', 'sale', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
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
        action: 'findOne',
        method: 'get',
        apps: ['accounts', 'sale', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
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
        return {
            path: `/cash-registers/active${qs ? '?' + qs : ''}`,
            action: 'find',
            method: 'get',
            apps: ['accounts', 'sale', 'accounts-viewer', 'auth'],
            approle: ['admin', 'manager', 'staff'],
        };
    },
    // Backward-compatible aliases expected by existing consumers
    fetchActive: ({ deskId, userId } = {}) => {
        const params = new URLSearchParams();
        if (deskId) params.set('desk_id', deskId);
        if (userId) params.set('user_id', userId);
        const qs = params.toString();
        return {
            path: `/cash-registers/active${qs ? '?' + qs : ''}`,
            action: 'find',
            method: 'get',
            apps: ['accounts', 'sale', 'accounts-viewer', 'auth'],
            approle: ['admin', 'manager', 'staff'],
        };
    },
/** Open a new cash register — body provided by caller as { data }. */
    open: (data) => ({
        path: '/cash-registers/open',
        action: 'create',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    postOpen: (data) => ({
        path: '/cash-registers/open',
        action: 'create',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Close a cash register by registerId.
     * @param {string} registerId
     */
    close: (registerId) => ({
        path: `/cash-registers/${registerId}/close`,
        action: 'update',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
    }),
    postClose: (registerId, data) => ({
        path: `/cash-registers/${registerId}/close`,
        action: 'update',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
/**
     * Async: close a cash register.
     * @param {string} registerId
     * @param {object} data
     */

};
