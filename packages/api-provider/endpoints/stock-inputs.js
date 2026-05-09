import { authApi } from '../lib/api.js';

export const StockInputsEndpoints = {
    list: (opts = {}) => ({ path: '/stock-inputs', params: opts }),
    byId: (documentId) => ({ path: `/stock-inputs/${documentId}` }),
    create: () => ({ path: '/stock-inputs' }),
    update: (documentId) => ({ path: `/stock-inputs/${documentId}` }),
    del: (documentId) => ({ path: `/stock-inputs/${documentId}` }),
    process: () => ({ path: '/stock-inputs/process' }),

    async fetchList(opts = {}) {
        const ep = StockInputsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    async postCreate(data) {
        const res = await authApi.post('/stock-inputs', { data });
        return res?.data ?? res;
    },
    async putUpdate(documentId, data) {
        const res = await authApi.put(`/stock-inputs/${documentId}`, { data });
        return res?.data ?? res;
    },
    async putDelete(documentId) {
        return authApi.del(`/stock-inputs/${documentId}`);
    },
    async postProcess(documentIds) {
        const body = documentIds ? { data: { documentIds } } : {};
        const res = await authApi.post('/stock-inputs/process', body);
        return res;
    },
};

/**
 * StockInputsEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const StockInputsEndpointRules = {
    /** GET /api/stock-inputs — paginated list */
    list: {
        injectPopulate: {
            branch: true,
            supplier: true,
        },
        injectSort: ['createdAt:desc'],
    },

    /** GET /api/stock-inputs/:id — byId with full populate */
    byId: {
        injectPopulate: {
            branch: true,
            supplier: true,
            items: { populate: { product: true } },
            processed_by: true,
        },
    },

    /** POST /api/stock-inputs — create */
    create: {},

    /** PUT /api/stock-inputs/:id — update */
    update: {},

    /** DELETE /api/stock-inputs/:id */
    delete: {},

    /** POST /api/stock-inputs/process — process (bulk or single) */
    process: {},
};



