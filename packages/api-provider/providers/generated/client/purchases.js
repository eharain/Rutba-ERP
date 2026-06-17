import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { PurchasesEndpoints as PurchasesEndpointsApi } from '../../../api/purchases.js';

async function list(page = 1, pageSize = 100, arg3 = {}) {
    const ep = PurchasesEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(idOrOrderId) {
    const ep = PurchasesEndpointsApi.byId(idOrOrderId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = PurchasesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = PurchasesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = PurchasesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function createBill(documentId) {
    const ep = PurchasesEndpointsApi.createBill(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'PurchasesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        createBill,
        meta: PurchasesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","createBill","meta"],
);

export default endpoints;
export const PurchasesEndpoints = endpoints;
