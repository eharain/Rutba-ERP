import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { PurchaseItemsEndpoints as PurchaseItemsEndpointsApi } from '../../../api/purchase-items.js';

async function list(purchaseDocId, arg2 = {}) {
    const ep = PurchaseItemsEndpointsApi.list(purchaseDocId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = PurchaseItemsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function byProduct(productDocId, arg2 = {}) {
    const ep = PurchaseItemsEndpointsApi.byProduct(productDocId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function update(documentId, data) {
    const ep = PurchaseItemsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = PurchaseItemsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function savePurchaseItem(item) {
    const ep = PurchaseItemsEndpointsApi.savePurchaseItem(item);
    return authApi.fetch(ep.path, ep.params);
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
