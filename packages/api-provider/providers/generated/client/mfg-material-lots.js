import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { MfgMaterialLotsEndpoints as MfgMaterialLotsEndpointsApi } from '../../../api/mfg-material-lots.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = MfgMaterialLotsEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId) {
    const ep = MfgMaterialLotsEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = MfgMaterialLotsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = MfgMaterialLotsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = MfgMaterialLotsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function recomputeLots() {
    const ep = MfgMaterialLotsEndpointsApi.recomputeLots();
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'MfgMaterialLotsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        recomputeLots,
        meta: MfgMaterialLotsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","recomputeLots","meta"],
);

export default endpoints;
export const MfgMaterialLotsEndpoints = endpoints;
