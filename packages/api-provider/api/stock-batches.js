/**
 * StockBatchesEndpoints
 * Pure endpoint descriptors for the /stock-batches resource — the optional
 * batch/lot + expiry grouping shared by finished goods and raw materials
 * (Inventory Foundation F3 / Epic 5).
 */
export const StockBatchesEndpoints = {

    meta: {
        uid: 'api::stock-batch.stock-batch',
        domains: ['stock', 'inventory', 'manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 50, { productDocId, statusFilter, branchDocId, expiringBefore, searchTerm, sort } = {}) => {
        const term = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        return {
            path: '/stock-batches',
            action: 'find',
            method: 'get',
            apps: ['inventory', 'stock'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                filters: {
                    ...(productDocId ? { product: { documentId: productDocId } } : {}),
                    ...(branchDocId ? { branch: { documentId: branchDocId } } : {}),
                    ...(statusFilter ? { status: statusFilter } : {}),
                    ...(expiringBefore ? { expiry_date: { $lte: expiringBefore } } : {}),
                    ...(term ? { $or: [{ batch_code: { $containsi: term } }] } : {}),
                },
                populate: { product: true, supplier: true, branch: true },
                sort: sort ?? ['expiry_date:asc'],
                pagination: { page, pageSize },
            },
        };
    },

    byId: (documentId) => ({
        path: `/stock-batches/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: { product: true, supplier: true, branch: true, stock_items: true },
        },
    }),

    create: (data) => ({
        path: '/stock-batches',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/stock-batches/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/stock-batches/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Admin reconcile — rebuild every product.bulk_quantity_on_hand from the live
     * sum of Active batch quantity_remaining. Route is auth:false + admin-gated in
     * the controller (mirrors stock-items/recompute-product-stock).
     * Handler: pos-strapi/src/api/stock-batch/controllers/recompute-product-bulk.js
     */
    recomputeProductBulk: () => ({
        path: '/stock-batches/recompute-product-bulk',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin'],
        data: {},
    }),
};
