/**
 * ProductsEndpoints
 * Pure endpoint descriptors for the /products resource.
 * All methods return { path, params?, data? } objects.
 * Transport execution happens via createClientProxy in /endpoints/products.js.
 *
 * Complex orchestration helpers (saveProduct, loadProduct, etc.) have been
 * moved to /endpoints/products.js.
 */
export const ProductsEndpoints = {

    meta: {
        uid: 'api::product.product',
        domains: ['stock', 'product'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * Paged product list — no search, no extra filters.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, populate? }} opts
     */
    listPaged: (page = 1, pageSize = 100, { sort, populate } = {}) => ({
        path: '/products',
        action: 'find',
        method: 'get',
        apps: ['stock', 'product'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            pagination: { page, pageSize },
            populate: populate ?? {
                categories: true,
                brands: true,
                suppliers: true,
                logo: true,
                gallery: true,
                items: true,
                purchase_items: { populate: { purchase: true } },
            },
        },
    }),

    /**
     * Fetch all products without pagination (use only when count is small).
     * @param {{ sort?, populate? }} opts
     */
    listAll: ({ sort, populate } = {}) => ({
        path: '/products',
        action: 'find',
        method: 'get',
        apps: ['stock', 'product'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            pagination: { page: 1, pageSize: 1000 },
            populate: populate ?? { categories: true, brands: true, suppliers: true, logo: true },
        },
    }),

    /**
     * List products with conditional filters (brands, categories, suppliers, purchases,
     * parentOnly, status, sort).
     *
     * @param {number} page
     * @param {number} pageSize
     * @param {{
     *   brands?: string[],
     *   categories?: string[],
     *   suppliers?: string[],
     *   purchases?: string[],
     *   parentOnly?: boolean,
     *   status?: string,
     *   sort?: string,
     *   fields?: string[]
     * }} filters
     */
    list: (page = 1, pageSize = 100, filters = {}) => {
        const { brands, categories, suppliers, purchases, parentOnly, status, sort, fields } = filters;

        const filterObj = {};

        if (Array.isArray(brands) && brands.length > 0) {
            filterObj.brands = { documentId: { $in: brands } };
        }
        if (Array.isArray(categories) && categories.length > 0) {
            filterObj.categories = { documentId: { $in: categories } };
        }
        if (Array.isArray(suppliers) && suppliers.length > 0) {
            filterObj.suppliers = { documentId: { $in: suppliers } };
        }
        if (Array.isArray(purchases) && purchases.length > 0) {
            filterObj.purchase_items = { purchase: { documentId: { $in: purchases } } };
        }
        if (parentOnly) {
            filterObj.parent = { $null: true };
        }

        const params = {
            populate: {
                categories: true,
                brands: true,
                suppliers: true,
                logo: true,
                gallery: true,
                items: true,
                purchase_items: { populate: { purchase: true } },
            },
            pagination: { page, pageSize },
            filters: Object.keys(filterObj).length > 0 ? filterObj : undefined,
            ...(sort ? { sort } : {}),
            ...(status ? { status } : {}),
            ...(fields ? { fields } : {}),
        };

        return { path: '/products', params };
    },

    /**
     * Full-text search across products (name, barcode, sku, suppliers, purchase orderId).
     *
     * @param {string} searchText
     * @param {number} page
     * @param {number} pageSize
     */
    search: (searchText, page = 1, pageSize = 20) => ({
        path: '/products',
        params: {
            filters: {
                $or: [
                    { name: { $containsi: searchText } },
                    { barcode: { $eq: searchText } },
                    { sku: { $eq: searchText } },
                    { suppliers: { $or: [{ name: { $containsi: searchText } }, { phone: { $containsi: searchText } }] } },
                    { purchase_items: { purchase: { orderId: { $containsi: searchText } } } },
                ],
            },
            populate: {
                categories: true,
                brands: true,
                suppliers: true,
                logo: true,
                gallery: true,
                items: true,
                purchase_items: { populate: { purchase: true } },
            },
            pagination: { page, pageSize },
        },
    }),

    /**
     * Search products for use inside a relation picker (lighter populate).
     * @param {string} searchText
     * @param {number} page
     * @param {number} pageSize
     */
    searchInRelation: (searchText, page = 1, pageSize = 10) => ({
        path: '/products',
        params: {
            filters: {
                $or: [
                    { name: { $containsi: searchText } },
                    { barcode: { $eq: searchText } },
                    { sku: { $eq: searchText } },
                ],
            },
            populate: { logo: true, categories: true, brands: true },
            pagination: { page, pageSize },
        },
    }),

    /**
     * Fetch a single product by documentId / id with full detail populate.
     * @param {string|number} documentId
     * @param {{ populate? }} opts
     */
    byId: (documentId, { populate } = {}) => ({
        path: `/products/${documentId}`,
        params: {
            populate: populate ?? {
                categories: true,
                brands: true,
                suppliers: true,
                logo: true,
                gallery: true,
                terms: true,
                parent: true,
            },
        },
    }),

    /** Create a new product — body provided by caller as { data }. */
    create: (data) => ({ path: '/products' , data }),

    /**
     * Update a product by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId, data) => ({ path: `/products/${documentId}` , data }),

    /**
     * Delete a product by documentId.
     * @param {string} documentId
     */
    del: (documentId) => ({ path: `/products/${documentId}` }),

    /**
     * Search products by name/SKU/barcode, excluding a specific documentId.
     * @param {string} term
     * @param {{ excludeDocId?, pageSize?, populate? }} opts
     */
    searchByTerm: (term, { excludeDocId, pageSize = 20, populate } = {}) => ({
        path: '/products',
        params: {
            sort: ['name:asc'],
            filters: {
                ...(excludeDocId ? { documentId: { $ne: excludeDocId } } : {}),
                $or: [
                    { name: { $containsi: term } },
                    { sku: { $containsi: term } },
                    { barcode: { $containsi: term } },
                ],
            },
            populate: populate ?? { categories: true, brands: true, suppliers: true, terms: true, logo: true },
            pagination: { page: 1, pageSize },
        },
    }),

    /**
     * List child products (variants) by parent documentId.
     * @param {string} parentDocId
     * @param {{ page?, pageSize?, populate? }} opts
     */
    byParent: (parentDocId, { page = 1, pageSize = 500, populate } = {}) => ({
        path: '/products',
        params: {
            filters: { parent: { documentId: parentDocId } },
            pagination: { page, pageSize },
            ...(populate ? { populate } : {}),
        },
    }),

    /**
     * Fetch product by ID in draft status.
     * @param {string} documentId
     * @param {object} params - Additional query params
     */
    byIdDraft: (documentId, params = {}) => ({
        path: `/products/${documentId}`,
        params: { status: 'draft', ...params },
    }),

    /**
     * Fetch product by ID in published status.
     * @param {string} documentId
     * @param {object} params - Additional query params
     */
    byIdPublished: (documentId, params = {}) => ({
        path: `/products/${documentId}`,
        params: { status: 'published', ...params },
    }),

    /**
     * Update product in draft status.
     * @param {string} documentId
     */
    updateDraft: (documentId, data) => ({
        path: `/products/${documentId}`,
        params: { status: 'draft' },
    }),

    /**
     * Publish a product — custom Strapi action.
     * @param {string} documentId
     */
    publish: (documentId) => ({ 
        path: `/products/${documentId}/publish`,
    }),

    /**
     * Unpublish a product — custom Strapi action.
     * @param {string} documentId
     */
    unpublish: (documentId) => ({ 
        path: `/products/${documentId}/unpublish`,
    }),
};

/**
 * ProductsEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const ProductsEndpointRules = {
    /** GET /api/products — paginated list with category/brand populate */
    list: {
        injectPopulate: {
            logo: true,
            categories: true,
            brands: true,
        },
        injectSort: ['name:asc'],
    },

    /**
     * GET /api/products/:id — byId with full detail populate
     */
    byId: {
        injectPopulate: {
            categories: true,
            brands: true,
            suppliers: true,
            logo: true,
            gallery: true,
            terms: true,
            parent: true,
        },
    },

    /**
     * GET /api/products — search
     * Client passes: ?q=<term>
     * Server injects: $or containsi filter across name, sku, barcode
     */
    search: {
        filters: {
            $or: [
                { name: { $containsi: '$query.q' } },
                { sku: { $containsi: '$query.q' } },
                { barcode: { $containsi: '$query.q' } },
            ],
        },
        injectPopulate: {
            categories: true,
            brands: true,
            suppliers: true,
            terms: true,
            logo: true,
        },
    },

    /**
     * GET /api/products — byParent (child variants)
     * Client passes: ?parentDocId=<documentId>
     */
    byParent: {
        filters: {
            parent: { documentId: { $eq: '$query.parentDocId' } },
        },
    },

    /** POST /api/products — create */
    create: {},

    /** PUT /api/products/:id — update */
    update: {},

    /** DELETE /api/products/:id */
    delete: {},
};