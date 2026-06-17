import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { PaySalaryStructuresEndpoints as PaySalaryStructuresEndpointsApi } from '../../../api/pay-salary-structures.js';

async function list(arg1 = {}) {
    const ep = PaySalaryStructuresEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = PaySalaryStructuresEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = PaySalaryStructuresEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = PaySalaryStructuresEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = PaySalaryStructuresEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'PaySalaryStructuresEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: PaySalaryStructuresEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const PaySalaryStructuresEndpoints = endpoints;
