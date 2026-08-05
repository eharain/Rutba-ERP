import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { HrBusinessUnitsEndpoints as HrBusinessUnitsEndpointsApi } from '../../../api/hr-business-units.js';

async function list(arg1 = {}) {
    const ep = HrBusinessUnitsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrBusinessUnitsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'HrBusinessUnitsEndpoints',
    {
        list,
        byId,
        meta: HrBusinessUnitsEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const HrBusinessUnitsEndpoints = endpoints;
