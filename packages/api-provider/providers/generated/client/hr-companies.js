import { authApi } from '../../../lib/api.js';
import { epCtx, strictEndpointGuard } from './___core__.js';
import { HrCompaniesEndpoints as HrCompaniesEndpointsApi } from '../../../api/hr-companies.js';

async function list(arg1 = {}) {
    const ep = HrCompaniesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrCompaniesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrCompaniesEndpoints',
    {
        list,
        byId,
        meta: HrCompaniesEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const HrCompaniesEndpoints = endpoints;
