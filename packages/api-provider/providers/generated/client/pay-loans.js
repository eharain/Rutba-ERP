import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { PayLoansEndpoints as PayLoansEndpointsApi } from '../../../api/pay-loans.js';

async function listMine() {
    const ep = PayLoansEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function request(data) {
    const ep = PayLoansEndpointsApi.request(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function listTeam() {
    const ep = PayLoansEndpointsApi.listTeam();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function approve(documentId) {
    const ep = PayLoansEndpointsApi.approve(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function reject(documentId, extra = {}) {
    const ep = PayLoansEndpointsApi.reject(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function list(arg1 = {}) {
    const ep = PayLoansEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = PayLoansEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'PayLoansEndpoints',
    {
        listMine,
        request,
        listTeam,
        approve,
        reject,
        list,
        byId,
        meta: PayLoansEndpointsApi.meta,
    },
    ["listMine","request","listTeam","approve","reject","list","byId","meta"],
);

export default endpoints;
export const PayLoansEndpoints = endpoints;
