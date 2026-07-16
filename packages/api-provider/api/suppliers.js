/**
 * SuppliersEndpoints
 * Centralised path + params definitions for the /suppliers content-type.
 */
import __publish_generic_helper from "./__publish_generic_helper.js";

export const SuppliersEndpoints = {

    // todo: spread adds updateDraft/publish/unpublish/create/del. Verify the
    // supplier content type supports draft-publish in pos-strapi; if it's a
    // plain CRUD type, the updateDraft/publish/unpublish methods will 404.
    ...__publish_generic_helper('suppliers'),

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
     * Fetch all suppliers — returns page-1 slice; callers loop via pagination meta.
     * @param {{ sort?, populate?, pageSize? }} opts
     */
    listAll: ({ sort, populate, pageSize = 100 } = {}) => ({
        path: '/suppliers',
        action: 'find',
        method: 'get',
        apps: ['stock', 'purchase', 'social'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { logo: true, gallery: true },
            pagination: { page: 1, pageSize },
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
        apps: ['stock', 'purchase'],
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
