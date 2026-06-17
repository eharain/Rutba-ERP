import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { PayPayrollRunsEndpoints as PayPayrollRunsEndpointsApi } from '../../../api/pay-payroll-runs.js';

async function list(arg1 = {}) {
    const ep = PayPayrollRunsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = PayPayrollRunsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = PayPayrollRunsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = PayPayrollRunsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = PayPayrollRunsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function runPreview(documentId) {
    const ep = PayPayrollRunsEndpointsApi.runPreview(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function process(documentId, extra = {}) {
    const ep = PayPayrollRunsEndpointsApi.process(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function cancel(documentId, extra = {}) {
    const ep = PayPayrollRunsEndpointsApi.cancel(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'PayPayrollRunsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        runPreview,
        process,
        cancel,
        meta: PayPayrollRunsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","runPreview","process","cancel","meta"],
);

export default endpoints;
export const PayPayrollRunsEndpoints = endpoints;
