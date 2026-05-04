import { authApi } from '../api.js';
import { buildEndpointMeta } from './access-metadata.js';

/**
 * CategoriesEndpoints
 * Centralised path + params definitions for the /categories content-type.
 */
export const CategoriesEndpoints = {

    /**
     * Paged category list.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, populate? }} opts
     */
    listPaged: (page = 1, pageSize = 100, { sort, populate } = {}) => ({
        path: '/categories',
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { parent: true, childern: true, logo: true, gallery: true },
            pagination: { page, pageSize },
        },
    }),

    /**
     * Fetch all categories — returns page-1 slice; callers loop via pagination meta.
     * @param {{ sort?, populate?, pageSize? }} opts
     */
    listAll: ({ sort, populate, pageSize = 100 } = {}) => ({
        path: '/categories',
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { parent: true, childern: true, logo: true, gallery: true },
            pagination: { page: 1, pageSize },
        },
    }),

    /**
     * Simple list for selectors / dropdowns.
     * Replaces qs-string: /categories?pagination[page]=${page}&pagination[pageSize]=100
     * @param {{ search?, sort?, populate?, page?, pageSize? }} opts
     */
    list: ({ search, sort, populate, page = 1, pageSize = 100 } = {}) => ({
        path: '/categories',
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { logo: true },
            pagination: { page, pageSize },
            ...(search ? { filters: { name: { $containsi: search } } } : {}),
        },
    }),

    /** Create a new category — body provided by caller as { data }. */
    create: () => ({ path: '/categories' }),

    /**
     * Update a category by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/categories/${documentId}` }),

    /**
     * Delete a category by documentId.
     * @param {string} documentId
     */
    del: (documentId) => ({ path: `/categories/${documentId}` }),

    /** Async: create a new category. */
    postCreate: (data) => authApi.post('/categories', { data }),

    /** Async: update a category by documentId. */
    putUpdate: (documentId, data) => authApi.put(`/categories/${documentId}`, { data }),

    /** Async: delete a category by documentId. */
    putDelete: (documentId) => authApi.del(`/categories/${documentId}`),
};

export const CategoriesEndpointsMeta = buildEndpointMeta('api::category.category', '/categories', {
    listPaged: 'find',
    listAll: 'find',
    list: 'find',
    create: 'create',
    update: 'update',
    del: 'delete',
});
