/**
 * CategoriesEndpoints
 * Centralised path + params definitions for the /categories content-type.
 */
import __publish_generic_helper from "./__publish_generic_helper.js";

export const CategoriesEndpoints = {

    // todo: spread adds updateDraft/publish/unpublish/create/del. Verify the
    // category content type has draft-publish enabled in pos-strapi before
    // relying on the publish/unpublish + updateDraft methods at runtime.
    ...__publish_generic_helper('categories'),

    /** Resource metadata for policy generation */
    meta: {
        uid: 'api::category.category',
        domains: ['cms', 'order-management', 'sale', 'stock'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * Paged category list.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, populate? }} opts
     */
    listPaged: (page = 1, pageSize = 100, { sort, populate } = {}) => ({
        path: '/categories',
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale', 'cms'],
        approle: ['admin', 'manager', 'staff'],
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
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale', 'cms', 'social'],
        approle: ['admin', 'manager', 'staff'],
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
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale', 'cms'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { logo: true },
            pagination: { page, pageSize },
            ...(search ? { filters: { name: { $containsi: search } } } : {}),
        },
    }),

    listDraft: ({ search, sort, populate, pagination } = {}) => ({
        path: '/categories',
        action: 'find',
        method: 'get',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager'],
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
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale', 'cms'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/categories/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager'],
        params: {
            status: 'draft',
            ...(populate ? { populate } : {}),
        },
    }),

    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/categories/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock', 'sale', 'cms'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    publish: (documentId) => ({
        path: `/categories/${documentId}/publish`,
        action: 'publish',
        method: 'post',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager']
    }),

    unpublish: (documentId) => ({
        path: `/categories/${documentId}/unpublish`,
        action: 'unpublish',
        method: 'post',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager']
    }),
    /** Async: fetch all categories across pages. */

    /** Create a new category. */
    create: (data) => ({
        path: '/categories',
        action: 'create',
        method: 'post',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager'],
        data,
    }),

    /** Update a category by documentId. */
    update: (documentId, data) => ({
        path: `/categories/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['stock', 'cms'],
        approle: ['admin', 'manager'],
        data,
    }),

    /**
     * Delete a category by documentId.
     * @param {string} documentId
     */
    del: (documentId) => ({
        path: `/categories/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['stock', 'cms'],
        approle: ['admin']
    }),


    /**
     * Fetch a paginated list of categories.
     * Previously standalone function, now part of the endpoint object.
     * @param {number} page
     * @param {number} rowsPerPage
      */

    /**
     * Search categories by name or code.
     * Previously standalone function, now part of the endpoint object.
     * @param {string} searchTerm
     * @param {number} page
     * @param {number} rowsPerPage
     */
    searchCategories: (searchTerm, page = 1, rowsPerPage = 5) => {
        const hasSearch = searchTerm && searchTerm.trim().length > 0;

        return {
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

    },
};
