import { authApi } from '../lib/api.js';
import { dataNode } from '../pos/search.js';

/**
 * BrandsEndpoints
 * Centralised path + params definitions for the /brands content-type.
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


    /** Async: fetch brand list (single page). */
    fetchList: (opts = {}) => {
        const ep = BrandsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch all brands across pages. */
    fetchAll: (opts = {}) => {
        const ep = BrandsEndpoints.list(opts);
        return authApi.getAll(ep.path, ep.params);
    },

    /** Create a new brand — body provided by caller as { data }. */
    create: () => ({
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
    update: (documentId) => ({
        path: `/brands/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager']
    }),

    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/brands/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager'],
        params: { status: 'draft', ...(populate ? { populate } : {}) },
    }),

    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/brands/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock', 'brand'],
        approle: ['admin', 'manager', 'staff'],
        params: { status: 'published', ...(fields ? { fields } : {}), ...(populate ? { populate } : {}) },
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

    /**
     * Fetch a paginated list of brands.
     * Previously standalone function, now part of the endpoint object.
     * @param {number} page
     * @param {number} rowsPerPage
     */
    fetchBrands: async (page, rowsPerPage) => {
        const ep = BrandsEndpoints.list({ page, pageSize: rowsPerPage ?? 100 });
        return await authApi.fetch(ep.path, ep.params);
    },
};

Object.assign(BrandsEndpoints, {
    async postCreate(data) {
        const ep = BrandsEndpoints.create();
        const res = await authApi.post(ep.path, { data });
        return res?.data ?? res;
    },
    async putUpdate(documentId, data) {
        const ep = BrandsEndpoints.update(documentId);
        const res = await authApi.put(ep.path, { data });
        return res?.data ?? res;
    },
    fetchByIdDraft(documentId, opts = {}) {
        const ep = BrandsEndpoints.byIdDraft(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchByIdPublished(documentId, opts = {}) {
        const ep = BrandsEndpoints.byIdPublished(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
    putUpdateDraft(documentId, data) {
        return authApi.put(`/brands/${documentId}`, { data, status: 'draft' });
    },
    postPublish(documentId) {
        return authApi.post(`/brands/${documentId}/publish`, {});
    },
    postUnpublish(documentId) {
        return authApi.post(`/brands/${documentId}/unpublish`, {});
    },
    delById(documentId) {
        return authApi.del(`/brands/${documentId}`);
    },
    async putDelete(documentId) {
        const ep = BrandsEndpoints.del(documentId);
        return authApi.del(ep.path);
    },
});

/**
 * BrandsEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const BrandsEndpointRules = {


    /** POST /api/brands */
    create: {},

    /** PUT /api/brands/:id */
    update: {},

    /** DELETE /api/brands/:id */
    delete: {},

    /** PUT /api/brands/:id/publish */
    publish: {},

    /** PUT /api/brands/:id/unpublish */
    unpublish: {},
};

