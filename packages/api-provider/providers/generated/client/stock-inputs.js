import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { StockInputsEndpoints as StockInputsEndpointsApi } from '../../../api/stock-inputs.js';

async function list(arg1 = {}) {
    const ep = StockInputsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = StockInputsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = StockInputsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = StockInputsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = StockInputsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function process(data) {
    const ep = StockInputsEndpointsApi.process(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'StockInputsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        process,
        meta: StockInputsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","process","meta"],
);

export default endpoints;
export const StockInputsEndpoints = endpoints;
