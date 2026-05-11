import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { PurchasesEndpoints as PurchasesEndpointsApi } from '../../../api/purchases.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', PurchasesEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', PurchasesEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', PurchasesEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', PurchasesEndpointsApi.update(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', PurchasesEndpointsApi.del(...args));
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
    fetchList,
    fetchById,
    postCreate,
    putUpdate,
    meta: PurchasesEndpointsApi.meta,
};

export default endpoints;
export const PurchasesEndpoints = endpoints;
