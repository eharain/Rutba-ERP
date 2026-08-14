import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HrOvertimeRulesEndpoints as HrOvertimeRulesEndpointsApi } from '../../../api/hr-overtime-rules.js';

async function list(arg1 = {}) {
    const ep = HrOvertimeRulesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrOvertimeRulesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = HrOvertimeRulesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = HrOvertimeRulesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrOvertimeRulesEndpoints',
    {
        list,
        byId,
        create,
        update,
        meta: HrOvertimeRulesEndpointsApi.meta,
    },
    ["list","byId","create","update","meta"],
);

export default endpoints;
export const HrOvertimeRulesEndpoints = endpoints;
