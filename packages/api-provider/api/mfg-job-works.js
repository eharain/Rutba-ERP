/**
 * MfgJobWorksEndpoints
 * Pure endpoint descriptors for the /mfg-job-works resource — outsourced
 * processing (e.g. third-party stitching) of serialized stock. A job work
 * dispatches stock-items to a vendor (units go AtJobWork), receives them back
 * transformed (new product / cost / price, or Lost/Damaged) and closes with a
 * vendor bill for the service charges.
 */
export const MfgJobWorksEndpoints = {

    meta: {
        uid: 'api::mfg-job-work.mfg-job-work',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { statusFilter, vendorDocId, branchDocId, searchTerm, sort } = {}) => {
        const term = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        return {
            path: '/mfg-job-works',
            action: 'find',
            method: 'get',
            apps: ['manufacturing'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                filters: {
                    ...(statusFilter ? { status: statusFilter } : {}),
                    ...(vendorDocId ? { vendor: { documentId: vendorDocId } } : {}),
                    ...(branchDocId ? { branch: { documentId: branchDocId } } : {}),
                    ...(term ? { $or: [{ jw_number: { $containsi: term } }, { name: { $containsi: term } }, { service_description: { $containsi: term } }] } : {}),
                },
                populate: { vendor: true, branch: true, bill: true, stock_items: { count: true }, items: { count: true } },
                sort: sort ?? ['createdAt:desc'],
                pagination: { page, pageSize },
            },
        };
    },

    byId: (documentId) => ({
        path: `/mfg-job-works/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {
                vendor: true,
                branch: true,
                bill: true,
                work_order: true,
                stock_items: { populate: { product: true } },
                items: {
                    populate: {
                        stock_item: true,
                        sent_product: true,
                        returned_product: true,
                    },
                },
            },
        },
    }),

    create: (data) => ({
        path: '/mfg-job-works',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-job-works/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-job-works/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
    }),

    /** Dispatch a Draft job work — units go AtJobWork and snapshot lines are created. (auth:false route; action:'create' for the verb whitelist.) */
    dispatch: (documentId) => ({
        path: `/mfg-job-works/${documentId}/dispatch`,
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data: {},
    }),

    /**
     * Receive resolved lines back from the vendor.
     * @param {string} documentId
     * @param {Array<{documentId: string, outcome: 'Returned'|'Lost'|'Damaged',
     *   returned_product?: string, service_charge?: number, cost_adjustment?: number,
     *   returned_selling_price?: number, notes?: string}>} lines
     */
    receive: (documentId, lines) => ({
        path: `/mfg-job-works/${documentId}/receive`,
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data: { lines },
    }),

    /** Cancel a Draft/Dispatched job work with no resolved lines — units revert to InStock. */
    cancel: (documentId) => ({
        path: `/mfg-job-works/${documentId}/cancel`,
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data: {},
    }),

    /** Close a fully-returned job work — generates the vendor bill (Dr INVENTORY / Cr AP). */
    close: (documentId) => ({
        path: `/mfg-job-works/${documentId}/close`,
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
        data: {},
    }),
};
