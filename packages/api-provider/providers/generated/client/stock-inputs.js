import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { StockInputsEndpoints as StockInputsEndpointsApi } from '../../../api/stock-inputs.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', StockInputsEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', StockInputsEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', StockInputsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', StockInputsEndpointsApi.update(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', StockInputsEndpointsApi.del(...args));
}

async function process(...args) {
    return executeEndpoint(authApi, 'process', StockInputsEndpointsApi.process(...args));
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
