import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MfgProductionLinesEndpoints as MfgProductionLinesEndpointsApi } from '../../../api/mfg-production-lines.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = MfgProductionLinesEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = MfgProductionLinesEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = MfgProductionLinesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = MfgProductionLinesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = MfgProductionLinesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'MfgProductionLinesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: MfgProductionLinesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const MfgProductionLinesEndpoints = endpoints;
