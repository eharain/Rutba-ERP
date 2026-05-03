/**
 * CmsPagesEndpoints
 * Centralised path + params definitions for the /cms-pages content-type.
 * Covers both the admin (pos-shared / rutba-cms) draft flows and the web storefront read flows.
 */
export const CmsPagesEndpoints = {

    /**
     * List published CMS pages (storefront / public-facing reads).
     * Sort, fields, and populate mirror the existing web service calls.
     * @param {{ pageType?, sort?, pageSize? }} opts
     */
    list: ({ pageType, sort, pageSize = 50 } = {}) => ({
        path: '/cms-pages',
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
    bySlug: (slug) => ({
        path: '/cms-pages',
        params: {
            filters: { slug: { $eq: slug } },
            fields: ['title', 'slug', 'excerpt', 'content', 'page_type', 'sort_order', 'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt', 'excerpt_priority', 'featured_image_priority', 'content_priority', 'gallery_priority', 'related_pages_priority'],
            populate: [
                'featured_image',
                'background_image',
                'gallery',
                'hero_product_groups.products.gallery',
                'hero_product_groups.products.logo',
                'hero_product_groups.products.brands',
                'hero_product_groups.products.categories',
                'hero_product_groups.products.variants',
                'hero_product_groups.products.variants.terms',
                'hero_product_groups.products.variants.terms.term_types',
                'hero_product_groups.cover_image',
                'hero_product_groups.offers',
                'brand_groups.brands.logo',
                'category_groups.categories.logo',
                'product_groups.products.gallery',
                'product_groups.products.logo',
                'product_groups.products.brands',
                'product_groups.products.categories',
                'product_groups.products.variants',
                'product_groups.products.variants.terms',
                'product_groups.products.variants.terms.term_types',
                'product_groups.cover_image',
                'product_groups.offers',
                'related_pages.featured_image',
                'footer.pinned_pages',
            ],
        },
    }),

    /**
     * Check for slug existence (lightweight — id + slug fields only).
     * @param {string} slug
     */
    bySlugCheck: (slug) => ({
        path: '/cms-pages',
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
        params: {
            filters: { slug: { $eq: 'index' } },
            fields: ['title', 'slug', 'excerpt', 'content', 'page_type', 'sort_order', 'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt'],
            populate: [
                'brand_groups.brands.logo',
                'category_groups.categories',
                'footer.pinned_pages',
            ],
        },
    }),

    /** Create a new CMS page — body provided by caller as { data }. */
    create: () => ({ path: '/cms-pages' }),

    /**
     * Update a CMS page by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/cms-pages/${documentId}` }),

    /**
     * Publish a CMS page — custom Strapi action.
     * @param {string} documentId
     */
    publish: (documentId) => ({ path: `/cms-pages/${documentId}/publish` }),

    /**
     * Unpublish a CMS page — custom Strapi action.
     * @param {string} documentId
     */
    unpublish: (documentId) => ({ path: `/cms-pages/${documentId}/unpublish` }),
};
