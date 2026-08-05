import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrLifecycleEventsEndpoints as HrLifecycleEventsEndpointsApi } from '../../../api/hr-lifecycle-events.js';

async function listMine() {
    const ep = HrLifecycleEventsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = HrLifecycleEventsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrLifecycleEventsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrLifecycleEventsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrLifecycleEventsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrLifecycleEventsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrLifecycleEventsEndpoints',
    {
        listMine,
        list,
        byId,
        create,
        update,
        del,
        meta: HrLifecycleEventsEndpointsApi.meta,
    },
    ["listMine","list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrLifecycleEventsEndpoints = endpoints;
