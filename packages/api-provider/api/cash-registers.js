/**
 * CashRegistersEndpoints
 * Centralised path + params definitions for /cash-registers and related custom routes.
 */

// Per-role server-side scope for every policy (method) below.
// Admin/manager: unrestricted. Staff: own registers from the last 7 days
// (single-row lookups stay ownership-only; create just stamps opened_by).
// The seeder reads this and writes the matching filtersTemplate / bodyTemplate
// per (method × role) into api_pro_method_policies; the Policy Editor shows
// each role's effective filter side-by-side.
const ROLE_SCOPES = {
    admin: {},
    manager: {},
    staff: {
        scope: 'owner+recency',
        ownerField: 'opened_by',
        recencyField: 'opened_at',
    },
};

export const CashRegistersEndpoints = {

    meta: {
        uid: 'api::cash-register.cash-register',
        domains: ['accounts', 'sale', 'accounts-viewer', 'auth'],
        roles: ['admin', 'manager', 'staff'],
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
        scope: ROLE_SCOPES,
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
        scope: ROLE_SCOPES,
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
            scope: ROLE_SCOPES,
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
            scope: ROLE_SCOPES,
        };
    },
/** Open a new cash register — body provided by caller as { data }. */
    open: (data) => ({
        path: '/cash-registers/open',
        action: 'create',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    postOpen: (data) => ({
        path: '/cash-registers/open',
        action: 'create',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
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
        scope: ROLE_SCOPES,
    }),
    postClose: (registerId, data) => ({
        path: `/cash-registers/${registerId}/close`,
        action: 'update',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
/**
     * Async: close a cash register.
     * @param {string} registerId
     * @param {object} data
     */

};
