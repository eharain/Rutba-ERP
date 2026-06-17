import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { PayPayslipsEndpoints as PayPayslipsEndpointsApi } from '../../../api/pay-payslips.js';

async function list(arg1 = {}) {
    const ep = PayPayslipsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = PayPayslipsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function listMyPayslips() {
    const ep = PayPayslipsEndpointsApi.listMyPayslips();
    return authApi.fetch(ep.path, ep.params);
}

async function setPaid(documentId, extra = {}) {
    const ep = PayPayslipsEndpointsApi.setPaid(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'PayPayslipsEndpoints',
    {
        list,
        byId,
        listMyPayslips,
        setPaid,
        meta: PayPayslipsEndpointsApi.meta,
    },
    ["list","byId","listMyPayslips","setPaid","meta"],
);

export default endpoints;
export const PayPayslipsEndpoints = endpoints;
