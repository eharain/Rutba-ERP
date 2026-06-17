import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { PayDeductionRulesEndpoints as PayDeductionRulesEndpointsApi } from '../../../api/pay-deduction-rules.js';

async function list(arg1 = {}) {
    const ep = PayDeductionRulesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = PayDeductionRulesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = PayDeductionRulesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = PayDeductionRulesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = PayDeductionRulesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'PayDeductionRulesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: PayDeductionRulesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const PayDeductionRulesEndpoints = endpoints;
