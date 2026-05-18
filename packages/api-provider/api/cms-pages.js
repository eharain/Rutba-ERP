/**
 * CmsPagesEndpoints
 * Centralised path + params definitions for the /cms-pages content-type.
 * Covers both the admin (pos-shared / rutba-cms) draft flows and the web storefront read flows.
 */
import __publish_generic_helper from "./__publish_generic_helper.js";
import { listParams, byIdParams } from './__param_builders.js';

export const CmsPagesEndpoints = {

    meta: {
        uid: 'api::cms-page.cms-page',
        domains: ['auth', 'cms', 'sale', 'stock', 'web', 'web-user'],
        roles: ['admin', 'manager', 'staff', 'public', 'user']
    },

    /**
     * List published CMS pages (storefront / public-facing reads).
     * @param {{ pageType? }} extra  — convenience filter shorthand for page_type.
     */
    list: ({ page, pageSize, sort, populate, filters, fields, pageType } = {}) => ({
        path: '/cms-pages',
        action: 'find',
        method: 'get',
        apps: ['cms', 'auth', 'stock', 'sale', 'web', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            {
                sort: ['sort_order:asc', 'createdAt:desc'],
                fields: ['title', 'slug', 'excerpt', 'page_type', 'sort_order', 'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt'],
                populate: {
                    featured_image: true,
                    background_image: true,
                    seo_meta: { fields: ['noindex', 'meta_title', 'meta_description'] },
                },
                pageSize: 50,
                ...(pageType ? { filters: { page_type: { $eq: pageType } } } : {}),
            },
        ),
    }),

    /**
     * Draft list — used by the rutba-cms admin screen.
     * @param {{ search?, typeFilter? }} extra  — convenience filter shortcuts.
     */
    listDraft: ({ page, pageSize, sort, populate, filters, fields, search, typeFilter } = {}) => {
        const shortcutFilters = {};
        if (search) shortcutFilters.title = { $containsi: search };
        if (typeFilter) shortcutFilters.page_type = { $eq: typeFilter };

        return {
            path: '/cms-pages',
            action: 'find',
            method: 'get',
            apps: ['cms', 'auth', 'stock'],
            approle: ['admin', 'manager', 'staff'],
            params: listParams(
                { page, pageSize, sort, populate, filters, fields },
                {
                    sort: ['sort_order:asc', 'createdAt:desc'],
                    populate: ['featured_image'],
                    pageSize: 50,
                    ...(Object.keys(shortcutFilters).length > 0 ? { filters: shortcutFilters } : {}),
                },
                { status: 'draft' },
            ),
        };
    },

    /**
     * Published list — used to determine publication state in the CMS screen.
     */
    listPublished: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-pages',
        action: 'find',
        method: 'get',
        apps: ['cms', 'auth', 'stock', 'sale', 'web', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { pageSize: 200, fields: ['documentId'] },
            { status: 'published' },
        ),
    }),

    /**
     * Fetch a single CMS page by slug with full detail populate (storefront).
     * @param {string} slug
     */

    bySlug: slug => ({
        path: '/cms-pages',
        action: 'find',
        method: 'get',
        apps: ['cms', 'auth', 'stock', 'sale', 'web', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: {
            filters: { slug: { $eq: slug } },
            fields: ['title', 'slug', 'excerpt', 'content', 'page_type', 'sort_order', 'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt', 'excerpt_priority', 'featured_image_priority', 'content_priority', 'product_groups_priority', 'gallery_priority', 'related_pages_priority'],
            populate: {
                featured_image: true, background_image: true, gallery: true,
                hero_product_groups: { populate: { cover_image: true, offers: true, products: { populate: { gallery: true, logo: true, brands: true, categories: true, variants: { populate: { terms: { populate: { term_types: true } } } } } } } },
                brand_groups: { populate: { brands: { populate: { logo: true } } } },
                category_groups: { populate: { categories: { populate: { logo: true } } } },
                product_groups: { populate: { cover_image: true, offers: true, products: { populate: { gallery: true, logo: true, brands: true, categories: true, variants: { populate: { terms: { populate: { term_types: true } } } } } } } },
                related_pages: { populate: { featured_image: true } },
                footer: { populate: { pinned_pages: true } },
                seo_meta: { populate: { og_image: true } }
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
        apps: ['cms', 'auth', 'stock', 'sale', 'web', 'web-user'],
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
        apps: ['cms', 'auth', 'stock', 'sale', 'web', 'web-user'],
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

    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/cms-pages/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['cms', 'auth', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }, {}, { status: 'draft' }),
    }),

    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/cms-pages/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['cms', 'auth', 'stock', 'sale', 'web', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: byIdParams({ populate, fields }, {}, { status: 'published' }),
    }),
    // todo: speculative stub — full (non-draft) update PUT. Used by the bulk CSV
    // import in rutba-cms/pages/pages.js where the row should overwrite both draft
    // and published. __publish_generic_helper only provides `updateDraft`; clarify
    // whether bulk import should hit `update` (PUT) or `updateDraft` + immediate
    // `publish`, and align the descriptor accordingly.
    update: (documentId, data) => ({
        path: `/cms-pages/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['cms', 'auth', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    ...__publish_generic_helper('cms-pages'),
};

