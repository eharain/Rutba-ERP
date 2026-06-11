/**
 * MfgMaterialLotsEndpoints
 * Pure endpoint descriptors for the /mfg-material-lots resource — the
 * quantity-based bulk-material ledger.
 */
export const MfgMaterialLotsEndpoints = {

    meta: {
        uid: 'api::mfg-material-lot.mfg-material-lot',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { statusFilter, productDocId, branchDocId, searchTerm, sort } = {}) => {
        const term = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        return {
            path: '/mfg-material-lots',
            action: 'find',
            method: 'get',
            apps: ['manufacturing'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                filters: {
                    ...(statusFilter ? { status: statusFilter } : {}),
                    ...(productDocId ? { product: { documentId: productDocId } } : {}),
                    ...(branchDocId ? { branch: { documentId: branchDocId } } : {}),
                    ...(term ? { $or: [{ lot_code: { $containsi: term } }, { name: { $containsi: term } }, { dye_lot: { $containsi: term } }] } : {}),
                },
                populate: { product: true, supplier: true, branch: true },
                sort: sort ?? ['createdAt:desc'],
                pagination: { page, pageSize },
            },
        };
    },

    byId: (documentId) => ({
        path: `/mfg-material-lots/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {
                product: true,
                supplier: true,
                branch: true,
                purchase_item: true,
                material_issues: { populate: { work_order: true, bundle: true } },
            },
        },
    }),

    create: (data) => ({
        path: '/mfg-material-lots',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-material-lots/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-material-lots/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
    }),

    /** Reconcile every lot's remaining balance from the issue ledger (manager only). */
    recomputeLots: () => ({
        path: '/mfg-material-lots/recompute',
        action: 'recompute',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data: {},
    }),
};
