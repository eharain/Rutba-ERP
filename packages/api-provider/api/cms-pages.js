/**
 * CmsPagesEndpoints
 * Centralised path + params definitions for the /cms-pages content-type.
 * Covers both the admin (pos-shared / rutba-cms) draft flows and the web storefront read flows.
 */
import __publish_generic_helper from "./__publish_generic_helper.js";

export const CmsPagesEndpoints = {

    meta: {
        uid: 'api::cms-page.cms-page',
        domains: ['cms', 'auth', 'stock', 'sale', 'web-public', 'web-authenticated', 'web-user'],
        roles: ['admin', 'manager', 'staff', 'public', 'user']
    },

    /**
     * List published CMS pages (storefront / public-facing reads).
     * Sort, fields, and populate mirror the existing web service calls.
     * @param {{ pageType?, sort?, pageSize? }} opts
     */
    list: ({ pageType, sort, pageSize = 50 } = {}) => ({
        path: '/cms-pages',
        action: 'find',
        method: 'get',
        apps: ['cms', 'auth', 'stock', 'sale', 'web-public', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: {
            sort: sort ?? ['sort_order:asc', 'createdAt:desc'],
            fields: ['title', 'slug', 'excerpt', 'page_type', 'sort_order', 'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt'],
            populate: ['featured_image', 'background_image'],
            pagination: { pageSize },
            ...(pageType ? { filters: { page_type: { $eq: pageType } } } : {}),
        },
    }),

    /**
     * Draft list — used by the rutba-cms admin screen.
     * Supports optional text search and page type filter.
     * @param {{ search?, typeFilter?, sort?, pageSize? }} opts
     */
    listDraft: ({ search, typeFilter, sort, pageSize = 50 } = {}) => {
        const filters = {};
        if (search) filters.title = { $containsi: search };
        if (typeFilter) filters.page_type = { $eq: typeFilter };

        return {
            path: '/cms-pages',
            action: 'find',
            method: 'get',
            apps: ['cms', 'auth', 'stock'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                status: 'draft',
                sort: sort ?? ['sort_order:asc', 'createdAt:desc'],
                populate: ['featured_image'],
                pagination: { pageSize },
                ...(Object.keys(filters).length > 0 ? { filters } : {}),
            },
        };
    },

    /**
     * Published list — used to determine publication state in the CMS screen.
     * @param {{ pageSize? }} opts
     */
    listPublished: ({ pageSize = 200 } = {}) => ({
        path: '/cms-pages',
        action: 'find',
        method: 'get',
        apps: ['cms', 'auth', 'stock', 'sale', 'web-public', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    /**
     * Fetch a single CMS page by slug with full detail populate (storefront).
     * @param {string} slug
     */

    bySlug: slug => ({
        path: '/cms-pages',
        action: 'find',
        method: 'get',
        apps: ['cms', 'auth', 'stock', 'sale', 'web-public', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: {
            filters: { slug: { $eq: slug } },
            fields: ['title', 'slug', 'excerpt', 'content', 'page_type', 'sort_order', 'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt', 'excerpt_priority', 'featured_image_priority', 'content_priority', 'gallery_priority', 'related_pages_priority'],
            populate: {
                featured_image: true, background_image: true, gallery: true,
                hero_product_groups: { populate: { cover_image: true, offers: true, products: { populate: { gallery: true, logo: true, brands: true, categories: true, variants: { populate: { terms: { populate: { term_types: true } } } } } } } },
                brand_groups: { populate: { brands: { populate: { logo: true } } } },
                category_groups: { populate: { categories: { populate: { logo: true } } } },
                product_groups: { populate: { cover_image: true, offers: true, products: { populate: { gallery: true, logo: true, brands: true, categories: true, variants: { populate: { terms: { populate: { term_types: true } } } } } } } },
                related_pages: { populate: { featured_image: true } },
                footer: { populate: { pinned_pages: true } }
            }
        }
    }),

    /**
     * Check for slug existence (lightweight — id + slug fields only).
     * @param {string} slug
     */
    bySlugCheck: (slug) => ({
        path: '/cms-pages',
        action: 'find',
        method: 'get',
        apps: ['cms', 'auth', 'stock', 'sale', 'web-public', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: {
            filters: { slug: { $eq: slug } },
            fields: ['id', 'documentId', 'slug'],
            pagination: { page: 1, pageSize: 1 },
        },
    }),

    /**
     * Header / navigation data — fetches the index page with brand and category groups.
     */
    headerData: () => ({
        path: '/cms-pages',
        action: 'find',
        method: 'get',
        apps: ['cms', 'auth', 'stock', 'sale', 'web-public', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: {
            filters: { slug: { $eq: 'index' } },
            fields: ['title', 'slug', 'excerpt', 'content', 'page_type', 'sort_order', 'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt'],
            populate: {
                brand_groups: { populate: { brands: { populate: { logo: true } } } },
                category_groups: { populate: { categories: true } },
                footer: { populate: { pinned_pages: true } }
            }
        }
    }),

    byIdDraft: (documentId, params = {}) => ({
        path: `/cms-pages/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['cms', 'auth', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: { status: 'draft', ...params },
    }),

    byIdPublished: (documentId, params = {}) => ({
        path: `/cms-pages/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['cms', 'auth', 'stock', 'sale', 'web-public', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: { status: 'published', ...params },
    }),
    ...__publish_generic_helper('cms-pages'),
};

