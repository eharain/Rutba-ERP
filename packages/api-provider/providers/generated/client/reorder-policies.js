import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { ReorderPoliciesEndpoints as ReorderPoliciesEndpointsApi } from '../../../api/reorder-policies.js';

async function list(page = 1, pageSize = 50, arg3 = {}) {
    const ep = ReorderPoliciesEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = ReorderPoliciesEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = ReorderPoliciesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = ReorderPoliciesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = ReorderPoliciesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function suggestions(arg1 = {}) {
    const ep = ReorderPoliciesEndpointsApi.suggestions(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function generatePurchases(body = {}) {
    const ep = ReorderPoliciesEndpointsApi.generatePurchases(body);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'ReorderPoliciesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        suggestions,
        generatePurchases,
        meta: ReorderPoliciesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","suggestions","generatePurchases","meta"],
);

export default endpoints;
export const ReorderPoliciesEndpoints = endpoints;
