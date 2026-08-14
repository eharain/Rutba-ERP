import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { PayAdjustmentsEndpoints as PayAdjustmentsEndpointsApi } from '../../../api/pay-adjustments.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = PayAdjustmentsEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId) {
    const ep = PayAdjustmentsEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byEmployee(employeeDocId, arg2 = {}) {
    const ep = PayAdjustmentsEndpointsApi.byEmployee(employeeDocId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = PayAdjustmentsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = PayAdjustmentsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = PayAdjustmentsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function recordDisbursement(documentId, body = {}) {
    const ep = PayAdjustmentsEndpointsApi.recordDisbursement(documentId, body);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'PayAdjustmentsEndpoints',
    {
        list,
        byId,
        byEmployee,
        create,
        update,
        del,
        recordDisbursement,
        meta: PayAdjustmentsEndpointsApi.meta,
    },
    ["list","byId","byEmployee","create","update","del","recordDisbursement","meta"],
);

export default endpoints;
export const PayAdjustmentsEndpoints = endpoints;
