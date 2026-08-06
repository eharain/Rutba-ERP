import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrAppraisalCyclesEndpoints as HrAppraisalCyclesEndpointsApi } from '../../../api/hr-appraisal-cycles.js';

async function list(arg1 = {}) {
    const ep = HrAppraisalCyclesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrAppraisalCyclesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrAppraisalCyclesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrAppraisalCyclesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrAppraisalCyclesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrAppraisalCyclesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: HrAppraisalCyclesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrAppraisalCyclesEndpoints = endpoints;
