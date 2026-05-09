import { authApi } from '../lib/api.js';
import { AuthApiEndpoints } from './http-client.js';
import { dataNode } from '../pos/search.js';

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

    listDraft: ({ search, sort, populate, pagination } = {}) => ({
        path: '/categories',
        params: {
            status: 'draft',
            sort: sort ?? ['name:asc'],
            populate: populate ?? ['logo', 'parent'],
            pagination: pagination ?? { pageSize: 100 },
            ...(search ? { filters: { name: { $containsi: search } } } : {}),
        },
    }),

    listPublished: ({ pageSize = 500 } = {}) => ({
        path: '/categories',
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/categories/${documentId}`,
        params: {
            status: 'draft',
            ...(populate ? { populate } : {}),
        },
    }),

    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/categories/${documentId}`,
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    publish: (documentId) => ({ path: `/categories/${documentId}/publish` }),
    unpublish: (documentId) => ({ path: `/categories/${documentId}/unpublish` }),

    /** Async: fetch category list (single page). */
    fetchList: (opts = {}) => {
        const ep = CategoriesEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    fetchListDraft: (opts = {}) => {
        const ep = CategoriesEndpoints.listDraft(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    fetchListPublished: (opts = {}) => {
        const ep = CategoriesEndpoints.listPublished(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    fetchByIdDraft: (documentId, opts = {}) => {
        const ep = CategoriesEndpoints.byIdDraft(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    fetchByIdPublished: (documentId, opts = {}) => {
        const ep = CategoriesEndpoints.byIdPublished(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch all categories across pages. */
    fetchAll: (opts = {}) => {
        const ep = CategoriesEndpoints.list(opts);
        return authApi.getAll(ep.path, ep.params);
    },

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
    putUpdateDraft: (documentId, data) => authApi.put(`/categories/${documentId}`, { data, status: 'draft' }),

    /** Async: delete a category by documentId. */
    putDelete: (documentId) => authApi.del(`/categories/${documentId}`),

    postPublish: (documentId) => authApi.post(`/categories/${documentId}/publish`, {}),
    postUnpublish: (documentId) => authApi.post(`/categories/${documentId}/unpublish`, {}),
};

/**
 * CategoriesEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const CategoriesEndpointRules = {
    /** GET /api/categories — list */
    list: {
        injectPopulate: { logo: true, parent: true },
        injectSort: ['name:asc'],
    },

    /** POST /api/categories */
    create: {},

    /** PUT /api/categories/:id */
    update: {},

    /** DELETE /api/categories/:id */
    delete: {},
};

/**
 * Fetch a paginated list of categories.
 * @param {number} page
 * @param {number} rowsPerPage
 */
export async function fetchCategories(page, rowsPerPage) {
    const ep = CategoriesEndpoints.list({ page, pageSize: rowsPerPage ?? 100 });
    return await AuthApiEndpoints.fetch(ep.path, ep.params);
}

/**
 * Search categories by name or code.
 * @param {string} searchTerm
 * @param {number} page
 * @param {number} rowsPerPage
 */
export async function searchCategories(searchTerm, page = 1, rowsPerPage = 5) {
    const hasSearch = searchTerm && searchTerm.trim().length > 0;
    const qs = (await import('qs')).default;
    const query = {
        populate: ['logo', 'gallery', { parent: { populate: ['logo', 'gallery'] } }],
        pagination: { page, pageSize: rowsPerPage },
        ...(hasSearch && {
            filters: {
                $or: [
                    { name: { $containsi: searchTerm } },
                    { code: { $eq: searchTerm } },
                ],
            },
        }),
    };
    const res = await AuthApiEndpoints.fetch(`/categories?${qs.stringify(query, { encodeValuesOnly: true })}`);
    return dataNode(res);
}



