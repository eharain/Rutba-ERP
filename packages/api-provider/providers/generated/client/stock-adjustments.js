import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { StockAdjustmentsEndpoints as StockAdjustmentsEndpointsApi } from '../../../api/stock-adjustments.js';

async function list(page = 1, pageSize = 50, arg3 = {}) {
    const ep = StockAdjustmentsEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = StockAdjustmentsEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = StockAdjustmentsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = StockAdjustmentsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = StockAdjustmentsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function post(documentId) {
    const ep = StockAdjustmentsEndpointsApi.post(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function cancel(documentId) {
    const ep = StockAdjustmentsEndpointsApi.cancel(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'StockAdjustmentsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        post,
        cancel,
        meta: StockAdjustmentsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","post","cancel","meta"],
);

export default endpoints;
export const StockAdjustmentsEndpoints = endpoints;
