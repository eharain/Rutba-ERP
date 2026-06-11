import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MfgQcInspectionsEndpoints as MfgQcInspectionsEndpointsApi } from '../../../api/mfg-qc-inspections.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = MfgQcInspectionsEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = MfgQcInspectionsEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = MfgQcInspectionsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = MfgQcInspectionsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = MfgQcInspectionsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'MfgQcInspectionsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: MfgQcInspectionsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const MfgQcInspectionsEndpoints = endpoints;
