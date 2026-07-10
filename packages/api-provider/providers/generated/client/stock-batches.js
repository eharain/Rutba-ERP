import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { StockBatchesEndpoints as StockBatchesEndpointsApi } from '../../../api/stock-batches.js';

async function list(page = 1, pageSize = 50, arg3 = {}) {
    const ep = StockBatchesEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = StockBatchesEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = StockBatchesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = StockBatchesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = StockBatchesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function recomputeProductBulk() {
    const ep = StockBatchesEndpointsApi.recomputeProductBulk();
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'StockBatchesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        recomputeProductBulk,
        meta: StockBatchesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","recomputeProductBulk","meta"],
);

export default endpoints;
export const StockBatchesEndpoints = endpoints;
