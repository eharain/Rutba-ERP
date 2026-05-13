import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
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

async function del(...args) {
    return executeEndpoint(authApi, 'del', PurchaseItemsEndpointsApi.del(...args));
}

async function savePurchaseItem(...args) {
    return executeEndpoint(authApi, 'savePurchaseItem', PurchaseItemsEndpointsApi.savePurchaseItem(...args));
}

const endpoints = strictEndpointGuard(
    'PurchaseItemsEndpoints',
    {
        list,
        create,
        byProduct,
        update,
        del,
        savePurchaseItem,
        meta: PurchaseItemsEndpointsApi.meta,
    },
    ["list","create","byProduct","update","del","savePurchaseItem","meta"],
);

export default endpoints;
export const PurchaseItemsEndpoints = endpoints;
