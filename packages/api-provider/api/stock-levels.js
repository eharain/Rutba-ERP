/**
 * StockLevelsEndpoints
 * Pure endpoint descriptors for the /stock-levels resource — the denormalised
 * per-(product, warehouse) on-hand cache (Inventory Foundation F2).
 *
 * Read-only from the client's perspective: the rows are maintained by the
 * stock-item lifecycle, never hand-written. Only a full-rebuild recompute is
 * exposed as a mutation (admin).
 */
export const StockLevelsEndpoints = {

    meta: {
        uid: 'api::stock-level.stock-level',
        domains: ['stock', 'inventory'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 100, { productDocId, warehouseDocId, inStockOnly, sort } = {}) => ({
        path: '/stock-levels',
        action: 'find',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: {
                ...(productDocId ? { product: { documentId: productDocId } } : {}),
                ...(warehouseDocId ? { warehouse: { documentId: warehouseDocId } } : {}),
                ...(inStockOnly ? { quantity_on_hand: { $gt: 0 } } : {}),
            },
            populate: { product: true, warehouse: true, storage_location: true, batch: true },
            sort: sort ?? ['id:asc'],
            pagination: { page, pageSize },
        },
    }),

    byProduct: (productDocId, { page = 1, pageSize = 200 } = {}) => ({
        path: '/stock-levels',
        action: 'find',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: { product: { documentId: productDocId } },
            populate: { warehouse: true, storage_location: true, batch: true },
            pagination: { page, pageSize },
        },
    }),

    /**
     * Admin full-DB rebuild of the stock-level cache. Idempotent. (auth:false
     * route + manual admin check; action:'create' satisfies the api-pro verb
     * whitelist like StockItemsEndpoints.recomputeProductStock.)
     */
    recompute: () => ({
        path: '/stock-levels/recompute',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin'],
        data: {},
    }),
};
