import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { HrDivisionsEndpoints as HrDivisionsEndpointsApi } from '../../../api/hr-divisions.js';

async function list(arg1 = {}) {
    const ep = HrDivisionsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrDivisionsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'HrDivisionsEndpoints',
    {
        list,
        byId,
        meta: HrDivisionsEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const HrDivisionsEndpoints = endpoints;
