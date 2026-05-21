import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { ReturnMethodsEndpoints as ReturnMethodsEndpointsApi } from '../../../api/return-methods.js';

async function list(arg1 = {}) {
    const ep = ReturnMethodsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = ReturnMethodsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = ReturnMethodsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = ReturnMethodsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'ReturnMethodsEndpoints',
    {
        list,
        byId,
        create,
        update,
        meta: ReturnMethodsEndpointsApi.meta,
    },
    ["list","byId","create","update","meta"],
);

export default endpoints;
export const ReturnMethodsEndpoints = endpoints;
