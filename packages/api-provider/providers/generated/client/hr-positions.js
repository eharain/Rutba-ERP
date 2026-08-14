import { authApi } from '../../../lib/api.js';
import { epCtx, strictEndpointGuard } from './___core__.js';
import { HrPositionsEndpoints as HrPositionsEndpointsApi } from '../../../api/hr-positions.js';

async function list(arg1 = {}) {
    const ep = HrPositionsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrPositionsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrPositionsEndpoints',
    {
        list,
        byId,
        meta: HrPositionsEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const HrPositionsEndpoints = endpoints;
