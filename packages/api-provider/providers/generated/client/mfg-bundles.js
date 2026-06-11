import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MfgBundlesEndpoints as MfgBundlesEndpointsApi } from '../../../api/mfg-bundles.js';

async function list(page = 1, pageSize = 50, arg3 = {}) {
    const ep = MfgBundlesEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = MfgBundlesEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = MfgBundlesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = MfgBundlesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = MfgBundlesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function processTransition(documentId, status, extra = {}) {
    const ep = MfgBundlesEndpointsApi.processTransition(documentId, status, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'MfgBundlesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        processTransition,
        meta: MfgBundlesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","processTransition","meta"],
);

export default endpoints;
export const MfgBundlesEndpoints = endpoints;
