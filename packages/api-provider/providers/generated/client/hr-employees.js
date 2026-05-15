import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrEmployeesEndpoints as HrEmployeesEndpointsApi } from '../../../api/hr-employees.js';

async function list(arg1 = {}) {
    const ep = HrEmployeesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrEmployeesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrEmployeesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrEmployeesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'HrEmployeesEndpoints',
    {
        list,
        byId,
        create,
        update,
        meta: HrEmployeesEndpointsApi.meta,
    },
    ["list","byId","create","update","meta"],
);

export default endpoints;
export const HrEmployeesEndpoints = endpoints;
