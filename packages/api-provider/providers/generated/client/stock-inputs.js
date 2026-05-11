import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
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

async function fetchList(...args) {
    return list(...args);
}

async function fetchById(...args) {
    return byId(...args);
}

async function postCreate(...args) {
    return create(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    list,
    byId,
    create,
    update,
    del,
    process,
    fetchList,
    fetchById,
    postCreate,
    putUpdate,
    meta: StockInputsEndpointsApi.meta,
};

export default endpoints;
export const StockInputsEndpoints = endpoints;
