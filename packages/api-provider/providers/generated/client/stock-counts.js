import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { StockCountsEndpoints as StockCountsEndpointsApi } from '../../../api/stock-counts.js';

async function list(page = 1, pageSize = 50, arg3 = {}) {
    const ep = StockCountsEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = StockCountsEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = StockCountsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = StockCountsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = StockCountsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function post(documentId) {
    const ep = StockCountsEndpointsApi.post(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function cancel(documentId) {
    const ep = StockCountsEndpointsApi.cancel(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'StockCountsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        post,
        cancel,
        meta: StockCountsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","post","cancel","meta"],
);

export default endpoints;
export const StockCountsEndpoints = endpoints;
