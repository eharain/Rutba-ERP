import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { PurchaseItemsEndpoints as PurchaseItemsEndpointsApi } from '../../../api/purchase-items.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', PurchaseItemsEndpointsApi.list(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', PurchaseItemsEndpointsApi.create(...args));
}

async function byProduct(...args) {
    return executeEndpoint(authApi, 'byProduct', PurchaseItemsEndpointsApi.byProduct(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', PurchaseItemsEndpointsApi.update(...args));
}

async function fetchList(...args) {
    return list(...args);
}

async function postCreate(...args) {
    return create(...args);
}

async function fetchByProduct(...args) {
    return byProduct(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    list,
    create,
    byProduct,
    update,
    fetchList,
    postCreate,
    fetchByProduct,
    putUpdate,
    meta: PurchaseItemsEndpointsApi.meta,
};

export default endpoints;
export const PurchaseItemsEndpoints = endpoints;
