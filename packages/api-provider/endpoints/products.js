import { authApi } from '../lib/api.js';
import { dataNode } from '../pos/search.js';
import { getBranch, getUser } from '../utils.js';

/**
 * ProductsEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 *
 * listPaged and search replicate the query shapes that were previously built by
 * urlAndRelations('products', ...) + qs-string filter concatenation in fetchs.js.
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

    byIdDraft: (documentId, params = {}) => ({
        path: `/products/${documentId}`,
        params: { status: 'draft', ...params },
    }),

    byIdPublished: (documentId, params = {}) => ({
        path: `/products/${documentId}`,
        params: { status: 'published', ...params },
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

    /** Async: fetch children by parent and return wrapped data. */
    fetchByParentDraft: (parentDocId, opts = {}) => {
        const ep = ProductsEndpoints.byParent(parentDocId, opts);
        return authApi.fetch(ep.path, { ...ep.params, status: 'draft' });
    },

    /** Async: search products by name/SKU/barcode. */
    fetchSearch: (term, opts = {}) => {
        const ep = ProductsEndpoints.search(term, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: search products for relation pickers. */
    fetchSearchInRelation: (searchText, page = 1, pageSize = 10) => {
        const ep = ProductsEndpoints.searchInRelation(searchText, page, pageSize);
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

    fetchByIdDraft: (documentId, params = {}) => {
        const ep = ProductsEndpoints.byIdDraft(documentId, params);
        return authApi.fetch(ep.path, ep.params);
    },

    fetchByIdPublished: (documentId, params = {}) => {
        const ep = ProductsEndpoints.byIdPublished(documentId, params);
        return authApi.fetch(ep.path, ep.params);
    },

    putUpdateDraft: (documentId, data) => authApi.put(`/products/${documentId}`, { data, status: 'draft' }),

    /** Async: delete a product by documentId. */
    putDelete: (documentId) => authApi.del(`/products/${documentId}`),

    /** Async: publish a product. */
    publish: (documentId) => ({ path: `/products/${documentId}/publish` }),

    /** Async: unpublish a product. */
    unpublish: (documentId) => ({ path: `/products/${documentId}/unpublish` }),

    /** Async: publish a product via helper. */
    postPublish: (documentId) => authApi.post(`/products/${documentId}/publish`, {}),

    /** Async: unpublish a product via helper. */
    postUnpublish: (documentId) => authApi.post(`/products/${documentId}/unpublish`, {}),

    /**
     * Inline-update product items without creating separate records.
     * Previously standalone function, now part of the endpoint object.
     * @param {string} id - documentId of the product
     * @param {Array} items
     */
    saveProductItems: async (id, items) => {
        return ProductsEndpoints.putUpdate(id, {
            items: items.map((i) => ({
                stock_item: i.stock_item.id,
                quantity: i.quantity,
                price: i.price,
            })),
        });
    },

    /**
     * Create or update a product.
     * Previously standalone function, now part of the endpoint object.
     * @param {string|number} id - documentId or 'new'
     * @param {Object} formData
     */
    saveProduct: async (id, formData) => {
        const containsAlphabet = (str) => /[a-zA-Z]/.test(str);
        const isUpdate = id && id !== 'new';
        const numericProps = [
            'offer_price', 'selling_price', 'tax_rate',
            'stock_quantity', 'reorder_level', 'bundle_units',
        ];
        const convertedFormData = { ...formData };
        numericProps.forEach((prop) => {
            if (convertedFormData[prop] !== undefined && convertedFormData[prop] !== '') {
                const num = Number(convertedFormData[prop]);
                if (!isNaN(num)) convertedFormData[prop] = num;
            }
        });
        const data = typeof id === 'string' && containsAlphabet(id)
            ? { ...convertedFormData }
            : { ...convertedFormData, id };
        return isUpdate
            ? ProductsEndpoints.putUpdate(id, data)
            : ProductsEndpoints.postCreate(data);
    },

    /**
     * Fetch a filtered/paginated product list.
     * Previously standalone function, now part of the endpoint object.
     * @param {{ searchText?, brands?, categories?, suppliers?, purchases?, parentOnly?, status? }} filters
     * @param {number} page
     * @param {number} rowsPerPage
     * @param {string} sort
     */
    fetchProducts: async (filters, page, rowsPerPage, sort) => {
        const { searchText } = filters;
        if (searchText && searchText.trim().length > 0) {
            const ep = ProductsEndpoints.search(searchText.trim(), page, rowsPerPage);
            return await authApi.get(ep.path, ep.params);
        }
        const ep = ProductsEndpoints.list(page, rowsPerPage, {
            brands: filters.brands,
            categories: filters.categories,
            suppliers: filters.suppliers,
            purchases: filters.purchases,
            parentOnly: filters.parentOnly,
            status: filters.status,
            sort,
        });
        return await authApi.get(ep.path, ep.params);
    },

    /**
     * Load a single product by id / documentId.
     * Previously standalone function, now part of the endpoint object.
     * @param {string|number} id
     */
    loadProduct: async (id) => {
        const ep = ProductsEndpoints.byId(id);
        const res = await authApi.get(ep.path, ep.params);
        return res.data || res;
    },

    /**
     * Full-text search for products.
     * Previously standalone function, now part of the endpoint object.
     * @param {string} searchTerm
     * @param {number} page
     * @param {number} rowsPerPage
     */
    searchProduct: async (searchTerm, page = 0, rowsPerPage = 100) => {
        const ep = ProductsEndpoints.search(searchTerm, page, rowsPerPage);
        const res = await authApi.get(ep.path, ep.params);
        return dataNode(res);
    },

    /**
     * Create a new draft product owned by the current user on the current branch.
     * Previously standalone function, now part of the endpoint object.
     * @returns {{ data, id, nameSingular, namePlural }}
     */
    createProduct: async () => {
        const user = getUser();
        const branch = getBranch();
        const data = {
            cost_price: 0,
            selling_price: 0,
            reorder_level: 1,
            is_active: false,
            branches: { connect: [branch.documentId] },
            owners: { connect: [user.documentId] },
        };
        const res = await ProductsEndpoints.postCreate(data);
        const rdata = res?.data ?? res;
        return { data: rdata, id: rdata.documentId ?? rdata.id, nameSingular: 'product', namePlural: 'products' };
    },

    /**
     * Search products by name, barcode, SKU, supplier, or purchase order.
     * Previously standalone function, now part of the endpoint object.
     * @param {string} searchTerm
     * @param {number} page
     * @param {number} rowsPerPage
     */
    searchProducts: async (searchTerm, page = 1, rowsPerPage = 5) => {
        const hasSearch = searchTerm && searchTerm.trim().length > 0;
        const query = {
            populate: {
                categories: true,
                brands: true,
                suppliers: true,
                logo: true,
                gallery: true,
                items: true,
                purchase_items: { populate: { purchase: true } },
            },
            pagination: { page, pageSize: rowsPerPage },
        };
        if (hasSearch) {
            query.filters = {
                $or: [
                    { name: { $containsi: searchTerm } },
                    { barcode: { $eq: searchTerm } },
                    { sku: { $eq: searchTerm } },
                    { suppliers: { $or: [{ name: { $containsi: searchTerm } }, { phone: { $containsi: searchTerm } }] } },
                    { purchase_items: { purchase: { orderId: { $containsi: searchTerm } } } },
                ],
            };
        }
        const qs = (await import('qs')).default;
        const res = await authApi.fetch(`/products?${qs.stringify(query, { encodeValuesOnly: true })}`);
        return dataNode(res);
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
