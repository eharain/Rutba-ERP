/**
 * MfgWorkOrdersEndpoints
 * Pure endpoint descriptors for the /mfg-work-orders resource (the job card).
 */
export const MfgWorkOrdersEndpoints = {

    meta: {
        uid: 'api::mfg-work-order.mfg-work-order',
        domains: ['manufacturing'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 20, { statusFilter, productionLineDocId, branchDocId, searchTerm, sort } = {}) => {
        const term = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        return {
            path: '/mfg-work-orders',
            action: 'find',
            method: 'get',
            apps: ['manufacturing'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                filters: {
                    ...(statusFilter ? { status: statusFilter } : {}),
                    ...(productionLineDocId ? { production_line: { documentId: productionLineDocId } } : {}),
                    ...(branchDocId ? { branch: { documentId: branchDocId } } : {}),
                    ...(term ? { $or: [{ wo_number: { $containsi: term } }, { name: { $containsi: term } }] } : {}),
                },
                populate: { product: true, production_line: true, bom: true },
                sort: sort ?? ['createdAt:desc'],
                pagination: { page, pageSize },
            },
        };
    },

    byId: (documentId) => ({
        path: `/mfg-work-orders/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: {
                product: true,
                branch: true,
                production_line: true,
                supervisor: true,
                sale_order: true,
                size_breakup: true,
                bom: { populate: { material_lines: { populate: { material_product: true } }, routing_steps: { populate: { operation: true } } } },
                bundles: true,
                tasks: { populate: { worker: { populate: { employee: true } }, operation: true } },
                material_issues: { populate: { material_lot: { populate: { product: true } } } },
                qc_inspections: { populate: { defect_lines: true } },
                finished_stock_items: true,
            },
        },
    }),

    create: (data) => ({
        path: '/mfg-work-orders',
        action: 'create',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mfg-work-orders/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/mfg-work-orders/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['manufacturing'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Drive the work order through its state machine.
     * @param {string} documentId
     * @param {string} status  one of Released|InProgress|OnHold|Completed|Cancelled
     * @param {object} [extra] e.g. { quantity_finished }
     */
    processTransition: (documentId, status, extra = {}) => ({
        path: `/mfg-work-orders/${documentId}/process`,
        action: 'process',
        method: 'post',
        apps: ['manufacturing'],
        approle: ['admin', 'manager', 'staff'],
        data: { status, ...extra },
    }),
};
