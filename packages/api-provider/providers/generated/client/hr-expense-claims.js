import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HrExpenseClaimsEndpoints as HrExpenseClaimsEndpointsApi } from '../../../api/hr-expense-claims.js';

async function listMine() {
    const ep = HrExpenseClaimsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function submit(data) {
    const ep = HrExpenseClaimsEndpointsApi.submit(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function listTeam() {
    const ep = HrExpenseClaimsEndpointsApi.listTeam();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function approve(documentId) {
    const ep = HrExpenseClaimsEndpointsApi.approve(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function reject(documentId, extra = {}) {
    const ep = HrExpenseClaimsEndpointsApi.reject(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function reimburse(documentId) {
    const ep = HrExpenseClaimsEndpointsApi.reimburse(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function list(arg1 = {}) {
    const ep = HrExpenseClaimsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrExpenseClaimsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrExpenseClaimsEndpoints',
    {
        listMine,
        submit,
        listTeam,
        approve,
        reject,
        reimburse,
        list,
        byId,
        meta: HrExpenseClaimsEndpointsApi.meta,
    },
    ["listMine","submit","listTeam","approve","reject","reimburse","list","byId","meta"],
);

export default endpoints;
export const HrExpenseClaimsEndpoints = endpoints;
