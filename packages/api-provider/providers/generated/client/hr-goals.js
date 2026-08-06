import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrGoalsEndpoints as HrGoalsEndpointsApi } from '../../../api/hr-goals.js';

async function listMine() {
    const ep = HrGoalsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function updateMine(documentId, data) {
    const ep = HrGoalsEndpointsApi.updateMine(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function list(arg1 = {}) {
    const ep = HrGoalsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrGoalsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrGoalsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrGoalsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrGoalsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrGoalsEndpoints',
    {
        listMine,
        updateMine,
        list,
        byId,
        create,
        update,
        del,
        meta: HrGoalsEndpointsApi.meta,
    },
    ["listMine","updateMine","list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrGoalsEndpoints = endpoints;
