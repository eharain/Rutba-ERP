import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HrLeaveBalancesEndpoints as HrLeaveBalancesEndpointsApi } from '../../../api/hr-leave-balances.js';

async function list(arg1 = {}) {
    const ep = HrLeaveBalancesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrLeaveBalancesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = HrLeaveBalancesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = HrLeaveBalancesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrLeaveBalancesEndpoints',
    {
        list,
        byId,
        create,
        update,
        meta: HrLeaveBalancesEndpointsApi.meta,
    },
    ["list","byId","create","update","meta"],
);

export default endpoints;
export const HrLeaveBalancesEndpoints = endpoints;
