import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MfgOperationsEndpoints as MfgOperationsEndpointsApi } from '../../../api/mfg-operations.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = MfgOperationsEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = MfgOperationsEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = MfgOperationsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = MfgOperationsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = MfgOperationsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'MfgOperationsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: MfgOperationsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const MfgOperationsEndpoints = endpoints;
