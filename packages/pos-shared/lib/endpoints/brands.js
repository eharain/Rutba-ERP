/**
 * BrandsEndpoints
 * Centralised path + params definitions for the /brands content-type.
 *
 * Covers both the pos-stock management UI (draft/publish flows)
 * and simple list/paginated lookups used across other pages.
 */
import { authApi } from '../api.js';

export const BrandsEndpoints = {

    /**
     * Paged brand list — simple name-sorted fetch.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, populate? }} opts
     */
    listPaged: (page = 1, pageSize = 100, { sort, populate } = {}) => ({
        path: '/brands',
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
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    /** Create a new brand — body provided by caller as { data }. */
    create: () => ({ path: '/brands' }),

    /**
     * Update a brand by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/brands/${documentId}` }),

    /**
     * Delete a brand by documentId.
     * @param {string} documentId
     */
    del: (documentId) => ({ path: `/brands/${documentId}` }),

    /**
     * Publish a brand — custom Strapi action.
     * @param {string} documentId
     */
    publish: (documentId) => ({ path: `/brands/${documentId}/publish` }),

    /**
     * Unpublish a brand — custom Strapi action.
     * @param {string} documentId
     */
    unpublish: (documentId) => ({ path: `/brands/${documentId}/unpublish` }),
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
    async putDelete(documentId) {
        const ep = BrandsEndpoints.del(documentId);
        return authApi.del(ep.path);
    },
});

export const BrandsEndpointsMeta = {
    uid: 'api::brand.brand',
    basePath: '/brands',
    methodActions: {
        listPaged: 'find',
        listAll: 'find',
        list: 'find',
        listDraft: 'find',
        listPublished: 'find',
        create: 'create',
        update: 'update',
        del: 'delete',
        publish: 'publish',
        unpublish: 'unpublish',
    },
};



