/**
 * StockAlertsEndpoints
 * Pure endpoint descriptors for the /stock-alerts resource — persisted low-stock
 * alerts upserted daily from the reorder suggestion engine. One row per
 * (product, branch) triggered; idempotent re-open / auto-resolve; dismissible.
 *
 * `list` / `byId` are the api-pro-gated CORE routes (whitelisted verbs list/by →
 * find/findOne). `acknowledge` / `dismiss` / `runNow` are custom auth:false routes
 * with their own controller (manual requireAppRole gate); their descriptors exist
 * for client codegen + /me/permissions, not for runtime gating.
 */
export const StockAlertsEndpoints = {

    meta: {
        uid: 'api::stock-alert.stock-alert',
        domains: ['inventory', 'stock'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: (page = 1, pageSize = 50, { statusFilter, severityFilter, branchDocId, productDocId, categoryDocId, brandDocId, supplierDocId, search, sort } = {}) => {
        const term = typeof search === 'string' ? search.trim() : '';
        // Product-taxonomy filters are expressed as nested relation filters on the
        // alert's `product` (categories / brands / suppliers are product m2m rels).
        const productFilter = {
            ...(productDocId ? { documentId: productDocId } : {}),
            ...(categoryDocId ? { categories: { documentId: categoryDocId } } : {}),
            ...(brandDocId ? { brands: { documentId: brandDocId } } : {}),
            ...(supplierDocId ? { suppliers: { documentId: supplierDocId } } : {}),
            ...(term ? { $or: [{ name: { $containsi: term } }, { sku: { $containsi: term } }] } : {}),
        };
        return {
            path: '/stock-alerts',
            action: 'find',
            method: 'get',
            apps: ['inventory', 'stock'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                filters: {
                    // Default to the actionable set (Open + Acknowledged) unless the
                    // caller asks for a specific status.
                    ...(statusFilter ? { status: statusFilter } : { status: { $in: ['Open', 'Acknowledged'] } }),
                    ...(severityFilter ? { severity: severityFilter } : {}),
                    ...(branchDocId ? { branch: { documentId: branchDocId } } : {}),
                    ...(Object.keys(productFilter).length ? { product: productFilter } : {}),
                },
                populate: { product: { populate: { logo: true } }, branch: true, policy: true },
                sort: sort ?? ['deficit:desc', 'createdAt:desc'],
                pagination: { page, pageSize },
            },
        };
    },

    byId: (documentId) => ({
        path: `/stock-alerts/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: { product: true, branch: true, policy: true, acknowledged_by: true, dismissed_by: true },
        },
    }),

    /** Acknowledge an Open alert (I've seen it / I'm on it). Staff allowed. */
    acknowledge: (documentId) => ({
        path: `/stock-alerts/${documentId}/acknowledge`,
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager', 'staff'],
        data: {},
    }),

    /** Dismiss an alert (ignore it — won't nag while still low). Manager/admin. */
    dismiss: (documentId, notes) => ({
        path: `/stock-alerts/${documentId}/dismiss`,
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data: { ...(notes ? { notes } : {}) },
    }),

    /** Manually run the low-stock scan now (instead of waiting for the daily cron). */
    runNow: () => ({
        path: '/stock-alerts/run-now',
        action: 'create',
        method: 'post',
        apps: ['inventory', 'stock'],
        approle: ['admin', 'manager'],
        data: {},
    }),
};
