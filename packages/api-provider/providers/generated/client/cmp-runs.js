import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { CmpRunsEndpoints as CmpRunsEndpointsApi } from '../../../api/cmp-runs.js';

async function list(arg1 = {}) {
    const ep = CmpRunsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = CmpRunsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function syncRun(documentId) {
    const ep = CmpRunsEndpointsApi.syncRun(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'CmpRunsEndpoints',
    {
        list,
        byId,
        syncRun,
        meta: CmpRunsEndpointsApi.meta,
    },
    ["list","byId","syncRun","meta"],
);

export default endpoints;
export const CmpRunsEndpoints = endpoints;
