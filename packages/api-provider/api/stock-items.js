/**
 * StockItemsEndpoints
 * Pure endpoint descriptors for the /stock-items resource.
 */
export const StockItemsEndpoints = {

    meta: {
        uid: 'api::stock-item.stock-item',
        domains: ['stock'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * Paginated list via the branch-scoped custom route /me/stock-items-search.
     * Encodes all conditional filter combinations into a single params object.
     *
     * @param {number} page   1-based
     * @param {number} pageSize
     * @param {{ statusFilter?, branchDocId?, productDocId?, showArchived?, sort? }} opts
     */
    list: (page = 1, pageSize = 20, { statusFilter, branchDocId, productDocId, showArchived, sort } = {}) => ({
        path: '/me/stock-items-search',
        action: 'find',
        method: 'get',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {
                product: true,
                purchase_item: { populate: { purchase: true } },
            },
            filters: {
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(branchDocId ? { branch: { documentId: branchDocId } } : {}),
                ...(productDocId ? { product: { documentId: productDocId } } : {}),
                ...(showArchived ? { archived: true } : {}),
            },
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
        },
    }),

    /**
     * List stock items that belong to a specific product.
     * Used by the product-stock-items page.
     *
     * @param {string} productDocId
     * @param {{ statusFilter?, page?, pageSize? }} opts
     */
    listByProduct: (productDocId, { statusFilter, page = 1, pageSize = 200, populate, fields, sort } = {}) => ({
        path: '/me/stock-items-search',
        params: {
            populate: populate ?? { product: true, purchase_item: { populate: { purchase: true } } },
            ...(fields ? { fields } : {}),
            filters: {
                product: { documentId: productDocId },
                ...(statusFilter ? { status: statusFilter } : {}),
            },
            pagination: { page, pageSize },
            sort: sort ?? ['createdAt:desc'],
        },
    }),

    /**
     * Lookup a stock item by exact barcode.
     * @param {string} barcode
     * @param {{ productDocId? }} opts  — optionally scope to a product
     */
    listByBarcode: (barcode, { productDocId } = {}) => ({
        path: '/stock-items',
        params: {
            filters: {
                barcode: { $eq: barcode },
                ...(productDocId ? { product: { documentId: { $eq: productDocId } } } : {}),
            },
            populate: { product: true },
        },
    }),

    /**
     * Check whether a barcode already exists.
     * Returns the matching stock item(s) so the caller can assert uniqueness.
     * @param {string} barcode
     */
    checkBarcode: (barcode) => ({
        path: '/stock-items',
        params: {
            filters: { barcode: { $eq: barcode } },
            fields: ['id', 'documentId', 'barcode'],
            pagination: { page: 1, pageSize: 1 },
        },
    }),

    /**
     * Orphan groups — custom Strapi route.
     * All filter/sort logic lives in the function body so the caller just passes a flat options bag.
     *
     * @param {{ page?, pageSize?, search?, statusFilter?, skuFilter?, sortField?, sortDir? }} opts
     */
    orphanGroups: ({ page = 1, pageSize = 50, search, statusFilter, skuFilter, sortField, sortDir } = {}) => ({
        path: '/stock-items/orphan-groups',
        params: {
            page,
            pageSize,
            ...(search ? { search } : {}),
            ...(statusFilter ? { statusFilter } : {}),
            ...(skuFilter ? { skuFilter } : {}),
            ...(sortField ? { sortField } : {}),
            ...(sortDir ? { sortDir } : {}),
        },
    }),

    /**
     * Items within a specific orphan group — custom Strapi route.
     * @param {{ page?, pageSize?, name?, selling_price?, statusFilter?, skuFilter?, sortField?, sortDir? }} opts
     */
    orphanGroupItems: ({ page = 1, pageSize = 10000, name, selling_price, statusFilter, skuFilter, sortField, sortDir } = {}) => ({
        path: '/stock-items/orphan-groups/items',
        params: {
            page,
            pageSize,
            ...(name !== undefined ? { name } : {}),
            ...(selling_price !== undefined ? { selling_price } : {}),
            ...(statusFilter ? { statusFilter } : {}),
            ...(skuFilter ? { skuFilter } : {}),
            ...(sortField ? { sortField } : {}),
            ...(sortDir ? { sortDir } : {}),
        },
    }),

    /** Create one or more stock items. */
    create: (data) => ({
        path: '/stock-items',
        action: 'create',
        method: 'post',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Search stock items by barcode (exact match).
     * @param {string} barcode
     */
    searchByBarcode: (barcode) => ({
        path: '/stock-items',
        params: { filters: { barcode: { $eq: barcode } } },
    }),

    /**
     * Search stock items by name (case-insensitive contains).
     * @param {string} name
     */
    searchByName: (name) => ({
        path: '/stock-items',
        params: { filters: { name: { $containsi: name } } },
    }),

    /**
     * Fetch a single stock item by id with optional populate.
     * @param {string|number} id
     * @param {{ populate? }} opts
     */
    byId: (id, { populate } = {}) => ({
        path: `/stock-items/${id}`,
        params: populate ? { populate } : undefined,
    }),

    /** Update a stock item by documentId. */
    update: (documentId, data) => ({
        path: `/stock-items/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['stock'],
        approle: ['admin', 'manager'],
        data,
    }),

    /**
     * List stock items by product documentId (for counting or transfer).
     * @param {string} productDocId
     * @param {{ page?, pageSize?, populate?, sort? }} opts
     */
    byProduct: (productDocId, { page = 1, pageSize = 100, populate, sort } = {}) => ({
        path: '/stock-items',
        params: {
            filters: { product: { documentId: productDocId } },
            pagination: { page, pageSize },
            ...(sort ? { sort } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    /**
     * Transfer stock items to another branch — custom Strapi route.
     * Body: { items: [documentId, ...], toBranch: branchDocId }
     */
    transfer: () => ({ path: '/stock-items/transfer' }),
};

/**
 * StockItemsEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const StockItemsEndpointRules = {
    /**
     * GET /me/stock-items-search — list (branch-scoped custom route)
     * Client passes: ?page&pageSize&statusFilter&branchDocId&productDocId
     * Server injects: populate; client filters are passed through
     */
    list: {
        injectPopulate: {
            product: true,
            purchase_item: { populate: { purchase: true } },
        },
    },

    /**
     * GET /me/stock-items-search — listByProduct
     * Client passes: ?productDocId=<documentId>
     */
    listByProduct: {
        filters: {
            product: { documentId: { $eq: '$query.productDocId' } },
        },
        injectPopulate: {
            product: true,
            purchase_item: { populate: { purchase: true } },
        },
    },

    /**
     * GET /me/stock-items-search — listByBarcode
     * Client passes: ?barcode=<value>
     */
    listByBarcode: {
        filters: {
            barcode: { $eq: '$query.barcode' },
        },
        injectPopulate: { product: true },
    },

    /**
     * GET /me/stock-items-search — searchByBarcode
     * Client passes: ?barcode=<value>
     */
    searchByBarcode: {
        filters: {
            barcode: { $containsi: '$query.barcode' },
        },
        injectPopulate: { product: true },
    },

    /**
     * GET /me/stock-items-search — searchByName
     * Client passes: ?name=<value>
     */
    searchByName: {
        filters: {
            $or: [
                { 'product.name': { $containsi: '$query.name' } },
                { barcode: { $containsi: '$query.name' } },
            ],
        },
        injectPopulate: { product: true },
    },

    /** GET /api/stock-items/orphan-groups — orphanGroups */
    orphanGroups: {},

    /** GET /api/stock-items/orphan-group-items — orphanGroupItems */
    orphanGroupItems: {},

    /** GET /api/stock-items/:id — byId */
    byId: {
        injectPopulate: { product: true, purchase_item: { populate: { purchase: true } } },
    },

    /**
     * GET /api/stock-items — byProduct
     * Client passes: ?productDocId=<documentId>
     */
    byProduct: {
        filters: {
            product: { documentId: { $eq: '$query.productDocId' } },
        },
    },

    /** POST /api/stock-items — create */
    create: {},

    /** PUT /api/stock-items/:id — update */
    update: {},

    /** POST /api/stock-items/transfer — transfer items to another branch */
    transfer: {},
};