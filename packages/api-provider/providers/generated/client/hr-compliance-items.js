import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrComplianceItemsEndpoints as HrComplianceItemsEndpointsApi } from '../../../api/hr-compliance-items.js';

async function listMine() {
    const ep = HrComplianceItemsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function listExpiring() {
    const ep = HrComplianceItemsEndpointsApi.listExpiring();
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = HrComplianceItemsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrComplianceItemsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrComplianceItemsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrComplianceItemsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrComplianceItemsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrComplianceItemsEndpoints',
    {
        listMine,
        listExpiring,
        list,
        byId,
        create,
        update,
        del,
        meta: HrComplianceItemsEndpointsApi.meta,
    },
    ["listMine","listExpiring","list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrComplianceItemsEndpoints = endpoints;
