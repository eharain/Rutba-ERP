/**
 * StockItemsEndpoints
 * Pure endpoint descriptors for the /stock-items resource.
 */
import { byIdParams } from './__param_builders.js';

export const StockItemsEndpoints = {

    meta: {
        uid: 'api::stock-item.stock-item',
        domains: ['sale', 'stock', 'inventory'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * Paginated list via the branch-scoped custom route /me/stock-items-search.
     * Encodes all conditional filter combinations into a single params object.
     *
     * @param {number} page   1-based
     * @param {number} pageSize
     * @param {{ statusFilter?, branchDocId?, productDocId?, showArchived?, sort?, searchTerm? }} opts
     */
    list: (page = 1, pageSize = 20, { statusFilter, branchDocId, productDocId, showArchived, sort, searchTerm } = {}) => {
        const term = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        const searchFilter = term
            ? {
                  $or: [
                      { name: { $containsi: term } },
                      { barcode: { $containsi: term } },
                      { sku: { $containsi: term } },
                      { product: { name: { $containsi: term } } },
                      { product: { sku: { $containsi: term } } },
                      // Manufacturer / EAN codes live on product.barcode (shared across
                      // all units) — include it so scanning the maker's label resolves.
                      { product: { barcode: { $containsi: term } } },
                  ],
              }
            : null;
        return {
            path: '/me/stock-items-search',
            action: 'find',
            method: 'get',
            apps: ['inventory', 'stock'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                // Populate product.logo + product.gallery so the sale-editor
                // search dropdown can render a thumbnail per row. Keeping these
                // to `fields: [...]` (or just allowing the whole relation)
                // shaves the payload — the consumer only reads url/formats.
                populate: {
                    product: { populate: { logo: true, gallery: true, brands: true } },
                    purchase_item: { populate: { purchase: true } },
                },
                filters: {
                    ...(statusFilter ? { status: statusFilter } : {}),
                    ...(branchDocId ? { branch: { documentId: branchDocId } } : {}),
                    ...(productDocId ? { product: { documentId: productDocId } } : {}),
                    ...(showArchived ? { archived: true } : {}),
                    ...(searchFilter ? searchFilter : {}),
                },
                pagination: { page, pageSize },
                sort: sort ?? ['createdAt:desc'],
            },
        };
    },

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
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Bulk Stock-Item Import — DRY RUN (no writes).
     * For each row, resolves the target product (documentId / exact name / candidate
     * shortlist) and computes the intended per-unit barcodes + which already exist.
     * The server route lives at pos-strapi/src/api/stock-item/controllers/stock-item.js
     * (resolveBulkStock).
     *
     * @param {Array<object>} rows
     */
    resolveBulkStock: (rows) => ({
        path: '/stock-items/bulk-resolve',
        action: 'resolveBulkStock',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data: { rows },
    }),

    /**
     * Bulk Stock-Item Import — COMMIT.
     * Creates/updates stock items in bulk; the entered barcode is stored as the
     * product barcode and each stock item gets a unique derived barcode. Returns
     * { processed, ok, failed, results, createdStockItemDocumentIds }.
     * Server route: stock-item.processBulkStock.
     *
     * @param {Array<object>} rows
     */
    processBulkStock: (rows) => ({
        path: '/stock-items/bulk-process',
        action: 'processBulkStock',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data: { rows },
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
     */
    byId: (id, { populate, fields } = {}) => ({
        path: `/stock-items/${id}`,
        params: byIdParams({ populate, fields }),
    }),

    /** Update a stock item by documentId. */
    update: (documentId, data) => ({
        path: `/stock-items/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['inventory', 'stock'],
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
     * Admin-triggered job that walks every product and rebuilds
     * `product.stock_quantity` from the live count of InStock stock-items.
     * Idempotent — safe to invoke after migrations, suspected drift, or as
     * part of an ad-hoc reconciliation. The server route lives at
     * pos-strapi/src/api/stock-item/controllers/recompute-product-stock.js.
     *
     * Returns { processed, corrected, errors, durationMs }.
     */
    recomputeProductStock: () => ({
        path: '/stock-items/recompute-product-stock',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock', 'cms'],
        approle: ['admin'],
        data: {},
    }),

    /** InStock units expiring within `days` (soonest first). auth:false route + manual auth. */
    getExpiring: (days = 30) => ({
        path: '/stock-items/expiring',
        params: { days },
    }),

    /** Admin: flip every InStock unit past its expiry_date to Expired. Idempotent. */
    sweepExpired: () => ({
        path: '/stock-items/sweep-expired',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin'],
        data: {},
    }),

    /**
     * Inventory valuation report (serialized cost_price + bulk batch value), by
     * warehouse. Manager/admin only; auth:false route + manual role gate.
     */
    valuation: ({ warehouseDocId } = {}) => ({
        path: `/stock-items/valuation${warehouseDocId ? `?warehouse=${warehouseDocId}` : ''}`,
        params: {},
    }),

    /**
     * Bulk-move stock items to another branch in a single round-trip.
     * Each item is set to branch=toBranch + status='InStock', and a
     * `Transferred` entry is appended to its status_history so the move
     * shows up on the audit trail. The server route lives at
     * pos-strapi/src/api/stock-item/controllers/transfer.js.
     *
     * @param {{ items: Array<string|number>, toBranch: string|number, reason?: string }} payload
     */
    transfer: (payload = {}) => ({
        path: '/stock-items/transfer',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data: payload,
    }),

    /**
     * Sell `qty` sub-units of a DIVISIBLE product at POS (Divisible P2c). Consumes
     * units across the product's InStock items (opened-first → FEFO; depleting
     * units flip to Sold) and, when `saleItemDocId` is given, links them to that
     * sale-item. Server allocates + prices per sub-unit; never trust the client for
     * that math. auth:false route + manual auth. Returns
     * { success, allocations, totalUnits, totalPrice, warning? }; 409 when short.
     *
     * @param {{ productDocId: string, qty: number, scannedItemDocId?: string, saleItemDocId?: string }} payload
     */
    sellUnits: ({ productDocId, qty, scannedItemDocId, saleItemDocId } = {}) => ({
        path: '/stock-items/sell-units',
        action: 'run',
        method: 'post',
        apps: ['sale', 'inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data: {
            product_document_id: productDocId,
            qty,
            ...(scannedItemDocId ? { scanned_item_document_id: scannedItemDocId } : {}),
            ...(saleItemDocId ? { sale_item_document_id: saleItemDocId } : {}),
        },
    }),
};

