import { authApi } from '../../../lib/api.js';
import { epCtx, strictEndpointGuard } from './___core__.js';
import { CmpEventsEndpoints as CmpEventsEndpointsApi } from '../../../api/cmp-events.js';

async function list(arg1 = {}) {
    const ep = CmpEventsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = CmpEventsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'CmpEventsEndpoints',
    {
        list,
        byId,
        meta: CmpEventsEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const CmpEventsEndpoints = endpoints;
