import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SaleReturnsEndpoints as SaleReturnsEndpointsApi } from '../../../api/sale-returns.js';

async function list(page = 1, pageSize = 100, arg3 = {}) {
    const ep = SaleReturnsEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = SaleReturnsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function byId(documentId, arg2 = {}) {
    const ep = SaleReturnsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function update(documentId, data) {
    const ep = SaleReturnsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(documentId) {
    const ep = SaleReturnsEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = SaleReturnsEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'SaleReturnsEndpoints',
    {
        list,
        create,
        byId,
        update,
        publish,
        unpublish,
        meta: SaleReturnsEndpointsApi.meta,
    },
    ["list","create","byId","update","publish","unpublish","meta"],
);

export default endpoints;
export const SaleReturnsEndpoints = endpoints;
