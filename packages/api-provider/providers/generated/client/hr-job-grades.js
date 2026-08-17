import { authApi } from '../../../lib/api.js';
import { epCtx, strictEndpointGuard } from './___core__.js';
import { HrJobGradesEndpoints as HrJobGradesEndpointsApi } from '../../../api/hr-job-grades.js';

async function list(arg1 = {}) {
    const ep = HrJobGradesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrJobGradesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrJobGradesEndpoints',
    {
        list,
        byId,
        meta: HrJobGradesEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const HrJobGradesEndpoints = endpoints;
