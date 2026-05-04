import { authApi } from '../api.js';
import { buildEndpointMeta } from './access-metadata.js';

export const StockInputsEndpoints = {
    list: () => ({ path: '/stock-inputs' }),
    byId: (documentId) => ({ path: `/stock-inputs/${documentId}` }),
    create: () => ({ path: '/stock-inputs' }),
    update: (documentId) => ({ path: `/stock-inputs/${documentId}` }),
    del: (documentId) => ({ path: `/stock-inputs/${documentId}` }),
    process: () => ({ path: '/stock-inputs/process' }),

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

export const StockInputsEndpointsMeta = buildEndpointMeta('api::stock-input.stock-input', '/stock-inputs', {
    list: 'find',
    byId: 'findOne',
    create: 'create',
    update: 'update',
    del: 'delete',
    process: 'process',
});
