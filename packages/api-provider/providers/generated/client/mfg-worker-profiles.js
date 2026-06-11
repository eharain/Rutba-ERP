import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MfgWorkerProfilesEndpoints as MfgWorkerProfilesEndpointsApi } from '../../../api/mfg-worker-profiles.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = MfgWorkerProfilesEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = MfgWorkerProfilesEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = MfgWorkerProfilesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = MfgWorkerProfilesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = MfgWorkerProfilesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'MfgWorkerProfilesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: MfgWorkerProfilesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const MfgWorkerProfilesEndpoints = endpoints;
