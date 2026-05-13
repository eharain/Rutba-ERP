/**
 * SaleReturnsEndpoints
 */
import { byIdParams } from './__param_builders.js';

// Per-role scope shared by every policy below. Staff sees their own returns
// from the last 7 days; admin/manager unrestricted.
const ROLE_SCOPES = {
    admin: {},
    manager: {},
    staff: { scope: 'owner+recency', ownerField: 'createdBy', recencyField: 'createdAt' },
};

export const SaleReturnsEndpoints = {

    meta: {
        uid: 'api::sale-return.sale-return',
        domains: ['sale', 'return'],
        roles: ['admin', 'manager', 'staff'],
    },

    /**
     * List sale returns with pagination.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, filters?, populate? }} opts
     */
    list: (page = 1, pageSize = 100, { sort, filters, populate } = {}) => ({
        path: '/sale-returns',
        action: 'find',
        method: 'get',
        apps: ['sale', 'return'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: {
            sort: sort ?? ['createdAt:desc'],
            filters: filters ?? undefined,
            pagination: { page, pageSize },
            populate: populate ?? undefined,
        },
    }),

    /** Create a new sale return. */
    create: (data) => ({
        path: '/sale-returns',
        action: 'create',
        method: 'post',
        apps: ['sale', 'return'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /**
     * Fetch a single sale return by documentId with full populate.
     * @param {string} documentId
     */
    byId: (documentId, { populate, fields } = {}) => ({
        path: `/sale-returns/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['sale', 'return'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: byIdParams(
            { populate, fields },
            {
                populate: {
                    sale: { populate: { customer: true } },
                    items: { populate: { product: true, items: true } },
                    payments: true,
                    cash_register: true,
                    returned_by_user: true,
                },
            },
        ),
    }),

    /** Update a sale return by documentId. */
    update: (documentId, data) => ({
        path: `/sale-returns/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['sale', 'return'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    /**
     * Publish a sale return (draft → published).
     * @param {string} documentId
     */
    publish: (documentId) => ({
        path: `/sale-returns/${documentId}/publish`,
        action: 'publish',
        method: 'post',
        apps: ['sale', 'return'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
    }),

    /**
     * Unpublish a sale return.
     * @param {string} documentId
     */
    unpublish: (documentId) => ({
        path: `/sale-returns/${documentId}/unpublish`,
        action: 'unpublish',
        method: 'post',
        apps: ['sale', 'return'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
    }),
/** Async: fetch a single sale return by documentId. */
/** Async: update a sale return by documentId. */

    /**
     * Fetch a paginated list of sale returns.
     * Previously standalone function, now part of the endpoint object.
     * @param {number} page
     * @param {number} rowsPerPage
     */

};
