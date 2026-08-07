import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { CmpRunsEndpoints as CmpRunsEndpointsApi } from '../../../api/cmp-runs.js';

async function list(arg1 = {}) {
    const ep = CmpRunsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = CmpRunsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'CmpRunsEndpoints',
    {
        list,
        byId,
        meta: CmpRunsEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const CmpRunsEndpoints = endpoints;
