/**
 * CashRegistersEndpoints
 * Centralised path + params definitions for /cash-registers and related custom routes.
 */
import { listParams, byIdParams } from './__param_builders.js';

// Per-role server-side scope for every policy (method) below.
// Admin/manager: unrestricted. Staff: own registers from the last 7 days
// (single-row lookups stay ownership-only; create just stamps the opener).
// The seeder reads this and writes the matching filtersTemplate / bodyTemplate
// per (method × role) into api_pro_method_policies; the Policy Editor shows
// each role's effective filter side-by-side.
//
// ownerField MUST be the `opened_by_user` RELATION — the seeder's owner
// shorthand expands to `{ ownerField: { id: { $eq: $user.id } } }`, and the
// bare `opened_by` attribute is a display-name STRING, which makes that
// filter crash Strapi's query builder ("Undefined attribute level operator id").
const ROLE_SCOPES = {
    admin: {},
    manager: {},
    staff: {
        scope: 'owner+recency',
        ownerField: 'opened_by_user',
        recencyField: 'opened_at',
    },
};

export const CashRegistersEndpoints = {

    meta: {
        uid: 'api::cash-register.cash-register',
        domains: ['accounts', 'pos', 'accounts-viewer', 'auth'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cash-registers',
        action: 'find',
        method: 'get',
        apps: ['accounts', 'pos', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['opened_at:desc'], pageSize: 20 },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/cash-registers/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['accounts', 'pos', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: byIdParams({ populate, fields }),
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
            apps: ['accounts', 'pos', 'accounts-viewer', 'auth'],
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
            apps: ['accounts', 'pos', 'accounts-viewer', 'auth'],
            approle: ['admin', 'manager', 'staff'],
            scope: ROLE_SCOPES,
        };
    },
/** Open a new cash register — body provided by caller as { data }. */
    open: (data) => ({
        path: '/cash-registers/open',
        action: 'create',
        method: 'post',
        apps: ['accounts', 'pos', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    postOpen: (data) => ({
        path: '/cash-registers/open',
        action: 'create',
        method: 'post',
        apps: ['accounts', 'pos', 'accounts-viewer', 'auth'],
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
        apps: ['accounts', 'pos', 'accounts-viewer', 'auth'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),
    postClose: (registerId, data) => ({
        path: `/cash-registers/${registerId}/close`,
        action: 'update',
        method: 'post',
        apps: ['accounts', 'pos', 'accounts-viewer', 'auth'],
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
