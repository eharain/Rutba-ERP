/**
 * SuppliersEndpoints
 * Centralised path + params definitions for the /suppliers content-type.
 */
import { draftMethods, standard } from "./__publish_generic_helper.js";

export const SuppliersEndpoints = {

    // The todo that used to sit here asked whether supplier really supports
    // draft-publish. It does (draftAndPublish: true in the schema) — but
    // pos-strapi defines no /suppliers/:id/publish route, so the helper's
    // publish/unpublish pair was unreachable on either server. Dropped until
    // someone actually builds supplier publishing; nothing called them.
    ...draftMethods('suppliers'),
    ...standard('suppliers'),

    meta: {
        uid: 'api::supplier.supplier',
        domains: ['cms', 'order-management', 'stock'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * Paged supplier list.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, populate? }} opts
     */
    listPaged: (page = 1, pageSize = 100, { sort, populate } = {}) => ({
        path: '/suppliers',
        action: 'find',
        method: 'get',
        apps: ['stock', 'purchase'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { logo: true, gallery: true },
            pagination: { page, pageSize },
        },
    }),

    /**
     * Fetch all suppliers — returns one page; callers loop via pagination meta
     * (see pos-shared/hooks/useProductLookups). `page` is a real parameter:
     * hardcoding page 1 truncated every supplier dropdown at `pageSize`.
     * @param {{ sort?, populate?, page?, pageSize? }} opts
     */
    listAll: ({ sort, populate, page = 1, pageSize = 100 } = {}) => ({
        path: '/suppliers',
        action: 'find',
        method: 'get',
        // 'purchase' is not a domain key (see config/domains.json) — it granted
        // nothing. 'cms' and 'inventory' render supplier filter dropdowns.
        apps: ['stock', 'cms', 'inventory', 'social'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { logo: true, gallery: true },
            pagination: { page, pageSize },
        },
    }),

    /**
     * Simple list for selectors / dropdowns.
     * @param {{ search?, sort?, populate?, page?, pageSize? }} opts
     */
    list: ({ search, sort, populate, page = 1, pageSize = 100 } = {}) => ({
        path: '/suppliers',
        action: 'find',
        method: 'get',
        apps: ['stock', 'purchase', 'manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { logo: true },
            pagination: { page, pageSize },
            ...(search ? { filters: { name: { $containsi: search } } } : {}),
        },
    }),
/** Async: fetch all suppliers across pages. */

    /** Create a new supplier. */
    create: (data) => ({
        path: '/suppliers',
        action: 'create',
        method: 'post',
        apps: ['stock', 'purchase'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Update a supplier by documentId. */
    update: (documentId, data) => ({
        path: `/suppliers/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['stock', 'purchase'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
/** Async: update a supplier by documentId. */
};
