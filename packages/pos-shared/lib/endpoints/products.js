import { authApi } from '../api.js';

/**
 * ProductsEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 *
 * listPaged and search replicate the query shapes that were previously built by
 * urlAndRelations('products', ...) + qs-string filter concatenation in fetchs.js.
 */
export const ProductsEndpoints = {

    /**
     * Paged product list — no search, no extra filters.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, populate? }} opts
     */
    listPaged: (page = 1, pageSize = 100, { sort, populate } = {}) => ({
        path: '/products',
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
        params: {
            sort: sort ?? ['name:asc'],
            pagination: { page: 1, pageSize: 1000 },
            populate: populate ?? { categories: true, brands: true, suppliers: true, logo: true },
        },
    }),

    /**
     * List products with conditional filters (brands, categories, suppliers, purchases,
     * parentOnly, status, sort).  This replaces the qs-string building loop in fetchProducts().
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
     *   sort?: string
     * }} filters
     */
    list: (page = 1, pageSize = 100, filters = {}) => {
        const { brands, categories, suppliers, purchases, parentOnly, status, sort } = filters;

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
        };

        return { path: '/products', params };
    },

    /**
     * Full-text search across products (name, barcode, sku, suppliers, purchase orderId).
     * Mirrors the query shape built by buildQueries('products', searchText, page, rowsPerPage).
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
     * Replaces authApi.get(`/products/${id}`, query) in loadProduct().
     * @param {string|number} documentId
     */
    byId: (documentId) => ({
        path: `/products/${documentId}`,
        params: {
            populate: {
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
    create: () => ({ path: '/products' }),

    /**
     * Update a product by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/products/${documentId}` }),

    /**
     * Search products by name/SKU/barcode, excluding a specific documentId.
     * @param {string} term
     * @param {{ excludeDocId?, pageSize?, populate? }} opts
     */
    search: (term, { excludeDocId, pageSize = 20, populate } = {}) => ({
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
     * @param {{ page?, pageSize? }} opts
     */
    byParent: (parentDocId, { page = 1, pageSize = 500, populate } = {}) => ({
        path: '/products',
        params: {
            filters: { parent: { documentId: parentDocId } },
            pagination: { page, pageSize },
            ...(populate ? { populate } : {}),
        },
    }),

    /** Async: fetch a single product by documentId. */
    fetchById: (documentId) => {
        const ep = ProductsEndpoints.byId(documentId);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch child variants by parent documentId. */
    fetchByParent: (parentDocId, opts = {}) => {
        const ep = ProductsEndpoints.byParent(parentDocId, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: search products by name/SKU/barcode. */
    fetchSearch: (term, opts = {}) => {
        const ep = ProductsEndpoints.search(term, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch paginated product list with filters. */
    fetchList: (page, pageSize, filters = {}) => {
        const ep = ProductsEndpoints.list(page, pageSize, filters);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: create a new product. */
    postCreate: (data) => authApi.post('/products', { data }),

    /** Async: update a product by documentId. */
    putUpdate: (documentId, data) => authApi.put(`/products/${documentId}`, { data }),

    /** Async: delete a product by documentId. */
    putDelete: (documentId) => authApi.del(`/products/${documentId}`),
};

export const ProductsEndpointsMeta = {
    uid: 'api::product.product',
    basePath: '/products',
    methodActions: {
        listPaged: 'find',
        listAll: 'find',
        list: 'find',
        search: 'find',
        searchInRelation: 'find',
        byId: 'findOne',
        create: 'create',
        update: 'update',
        byParent: 'find',
    },
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



