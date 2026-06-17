import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { PayEmployeeProfilesEndpoints as PayEmployeeProfilesEndpointsApi } from '../../../api/pay-employee-profiles.js';

async function list(arg1 = {}) {
    const ep = PayEmployeeProfilesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = PayEmployeeProfilesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = PayEmployeeProfilesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = PayEmployeeProfilesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = PayEmployeeProfilesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'PayEmployeeProfilesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: PayEmployeeProfilesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const PayEmployeeProfilesEndpoints = endpoints;
