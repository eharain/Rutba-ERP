import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrLeavePoliciesEndpoints as HrLeavePoliciesEndpointsApi } from '../../../api/hr-leave-policies.js';

async function list(arg1 = {}) {
    const ep = HrLeavePoliciesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrLeavePoliciesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrLeavePoliciesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrLeavePoliciesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'HrLeavePoliciesEndpoints',
    {
        list,
        byId,
        create,
        update,
        meta: HrLeavePoliciesEndpointsApi.meta,
    },
    ["list","byId","create","update","meta"],
);

export default endpoints;
export const HrLeavePoliciesEndpoints = endpoints;
