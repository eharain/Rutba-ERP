import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { StockTransfersEndpoints as StockTransfersEndpointsApi } from '../../../api/stock-transfers.js';

async function list(page = 1, pageSize = 50, arg3 = {}) {
    const ep = StockTransfersEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = StockTransfersEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = StockTransfersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = StockTransfersEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = StockTransfersEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function dispatch(documentId) {
    const ep = StockTransfersEndpointsApi.dispatch(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function receive(documentId) {
    const ep = StockTransfersEndpointsApi.receive(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function cancel(documentId) {
    const ep = StockTransfersEndpointsApi.cancel(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'StockTransfersEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        dispatch,
        receive,
        cancel,
        meta: StockTransfersEndpointsApi.meta,
    },
    ["list","byId","create","update","del","dispatch","receive","cancel","meta"],
);

export default endpoints;
export const StockTransfersEndpoints = endpoints;
