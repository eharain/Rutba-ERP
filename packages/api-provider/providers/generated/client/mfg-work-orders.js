import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { MfgWorkOrdersEndpoints as MfgWorkOrdersEndpointsApi } from '../../../api/mfg-work-orders.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = MfgWorkOrdersEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId) {
    const ep = MfgWorkOrdersEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = MfgWorkOrdersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = MfgWorkOrdersEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = MfgWorkOrdersEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function processTransition(documentId, status, extra = {}) {
    const ep = MfgWorkOrdersEndpointsApi.processTransition(documentId, status, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'MfgWorkOrdersEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        processTransition,
        meta: MfgWorkOrdersEndpointsApi.meta,
    },
    ["list","byId","create","update","del","processTransition","meta"],
);

export default endpoints;
export const MfgWorkOrdersEndpoints = endpoints;
