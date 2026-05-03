import { authApi } from '../api.js';

/**
 * StockItemsEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const StockItemsEndpoints = {

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
    listByProduct: (productDocId, { statusFilter, page = 1, pageSize = 200 } = {}) => ({
        path: '/me/stock-items-search',
        params: {
            populate: { product: true, purchase_item: { populate: { purchase: true } } },
            filters: {
                product: { documentId: productDocId },
                ...(statusFilter ? { status: statusFilter } : {}),
            },
            pagination: { page, pageSize },
            sort: ['createdAt:desc'],
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

    /** Create one or more stock items — body provided by caller as { data }. */
    create: () => ({ path: '/stock-items' }),

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

    /**
     * Update a stock item by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/stock-items/${documentId}` }),

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

    /** Async: fetch paginated list (branch-scoped search). */
    fetchList: (page, pageSize, opts = {}) => {
        const ep = StockItemsEndpoints.list(page, pageSize, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch stock items belonging to a product. */
    fetchByProduct: (productDocId, opts = {}) => {
        const ep = StockItemsEndpoints.byProduct(productDocId, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch stock items belonging to a product via the branch-scoped route. */
    fetchListByProduct: (productDocId, opts = {}) => {
        const ep = StockItemsEndpoints.listByProduct(productDocId, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: search stock items by barcode. */
    fetchByBarcode: (barcode) => {
        const ep = StockItemsEndpoints.searchByBarcode(barcode);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: search stock items by name. */
    fetchByName: (name) => {
        const ep = StockItemsEndpoints.searchByName(name);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch a single stock item by id. */
    fetchById: (id, opts = {}) => {
        const ep = StockItemsEndpoints.byId(id, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch orphan groups. */
    fetchOrphanGroups: (opts = {}) => {
        const ep = StockItemsEndpoints.orphanGroups(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch items within an orphan group. */
    fetchOrphanGroupItems: (opts = {}) => {
        const ep = StockItemsEndpoints.orphanGroupItems(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};
