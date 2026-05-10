/**
 * BrandsEndpoints
 * Pure endpoint descriptors for the /brands resource.
 * All methods return { path, params?, data? } objects.
 * Transport execution happens via createClientProxy in /endpoints/brands.js.
 *
 * Covers both the pos-stock management UI (draft/publish flows)
 * and simple list/paginated lookups used across other pages.
 */
export const BrandsEndpoints = {

    meta: {
        uid: 'api::brand.brand',
        domains: ['stock', 'brand'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * Paged brand list — simple name-sorted fetch.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, populate? }} opts
     */
    listPaged: (page = 1, pageSize = 100, { sort, populate } = {}) => ({
        path: '/brands',
        action: 'find',
        method: 'get',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { logo: true, gallery: true },
            pagination: { page, pageSize },
        },
    }),

    /**
     * Fetch all brands across all pages (paginates internally by caller via multiple calls).
     * Returns the standard page-1 slice; callers loop using pagination meta.
     * @param {{ sort?, populate?, pageSize? }} opts
     */
    listAll: ({ sort, populate, pageSize = 100 } = {}) => ({
        path: '/brands',
        action: 'find',
        method: 'get',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { logo: true, gallery: true },
            pagination: { page: 1, pageSize },
        },
    }),

    /**
     * Simple list for selectors / small dropdowns.
     * @param {{ sort?, populate?, search? }} opts
     */
    list: ({ sort, populate, search } = {}) => ({
        path: '/brands',
        action: 'find',
        method: 'get',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { logo: true },
            pagination: { page: 1, pageSize: 500 },
            ...(search ? { filters: { name: { $containsi: search } } } : {}),
        },
    }),

    /**
     * Draft list — used by CMS brand management screen.
     * Supports optional name search filter.
     * @param {{ search?, sort?, populate?, pageSize? }} opts
     */
    listDraft: ({ search, sort, populate, pageSize = 100 } = {}) => ({
        path: '/brands',
        action: 'find',
        method: 'get',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager'],
        params: {
            status: 'draft',
            sort: sort ?? ['name:asc'],
            populate: populate ?? ['logo'],
            pagination: { pageSize },
            ...(search ? { filters: { name: { $containsi: search } } } : {}),
        },
    }),

    /**
     * Published list — used to determine publication state in the CMS screen.
     * @param {{ pageSize? }} opts
     */
    listPublished: ({ pageSize = 500 } = {}) => ({
        path: '/brands',
        action: 'find',
        method: 'get',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    /** Create a new brand — body provided by caller as { data }. */
    create: (data) => ({
        path: '/brands',
        action: 'create',
        method: 'post',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager']
    }),

    /**
     * Update a brand by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/brands/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager']
    }),

    /**
     * Fetch brand by ID in draft status.
     * @param {string} documentId
     * @param {{ populate? }} opts
     */
    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/brands/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager'],
        params: { status: 'draft', ...(populate ? { populate } : {}) },
    }),

    /**
     * Fetch brand by ID in published status.
     * @param {string} documentId
     * @param {{ fields?, populate? }} opts
     */
    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/brands/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager', 'staff'],
        params: { status: 'published', ...(fields ? { fields } : {}), ...(populate ? { populate } : {}) },
    }),

    /**
     * Update brand in draft status.
     * @param {string} documentId
     */
    updateDraft: (documentId, data) => ({
        path: `/brands/${documentId}`,
        params: { status: 'draft' },
    }),

    /**
     * Delete a brand by documentId.
     * @param {string} documentId
     */
    del: (documentId) => ({
        path: `/brands/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['stock', 'brand'],
        approle: ['admin']
    }),

    /**
     * Publish a brand — custom Strapi action.
     * @param {string} documentId
     */
    publish: (documentId) => ({
        path: `/brands/${documentId}/publish`,
        action: 'publish',
        method: 'post',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager']
    }),

    /**
     * Unpublish a brand — custom Strapi action.
     * @param {string} documentId
     */
    unpublish: (documentId) => ({
        path: `/brands/${documentId}/unpublish`,
        action: 'unpublish',
        method: 'post',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager']
    }),
};