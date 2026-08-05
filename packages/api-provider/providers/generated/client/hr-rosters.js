import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrRostersEndpoints as HrRostersEndpointsApi } from '../../../api/hr-rosters.js';

async function listMine() {
    const ep = HrRostersEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = HrRostersEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrRostersEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrRostersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrRostersEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrRostersEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrRostersEndpoints',
    {
        listMine,
        list,
        byId,
        create,
        update,
        del,
        meta: HrRostersEndpointsApi.meta,
    },
    ["listMine","list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrRostersEndpoints = endpoints;
