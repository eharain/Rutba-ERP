import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { HrCostCentersEndpoints as HrCostCentersEndpointsApi } from '../../../api/hr-cost-centers.js';

async function list(arg1 = {}) {
    const ep = HrCostCentersEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrCostCentersEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'HrCostCentersEndpoints',
    {
        list,
        byId,
        meta: HrCostCentersEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const HrCostCentersEndpoints = endpoints;
