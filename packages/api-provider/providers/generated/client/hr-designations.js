import { authApi } from '../../../lib/api.js';
import { epCtx, strictEndpointGuard } from './___core__.js';
import { HrDesignationsEndpoints as HrDesignationsEndpointsApi } from '../../../api/hr-designations.js';

async function list(arg1 = {}) {
    const ep = HrDesignationsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrDesignationsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrDesignationsEndpoints',
    {
        list,
        byId,
        meta: HrDesignationsEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const HrDesignationsEndpoints = endpoints;
