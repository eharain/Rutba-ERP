import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { CashRegisterTransactionEndpoints as CashRegisterTransactionEndpointsApi } from '../../../api/cash-register-transactions.js';

async function create(data) {
    const ep = CashRegisterTransactionEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function postCreate(data) {
    const ep = CashRegisterTransactionEndpointsApi.postCreate(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function byRegister(registerDocumentId, arg2 = {}) {
    const ep = CashRegisterTransactionEndpointsApi.byRegister(registerDocumentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function fetchByRegister(registerDocumentId, arg2 = {}) {
    const ep = CashRegisterTransactionEndpointsApi.fetchByRegister(registerDocumentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'CashRegisterTransactionEndpoints',
    {
        create,
        postCreate,
        byRegister,
        fetchByRegister,
        meta: CashRegisterTransactionEndpointsApi.meta,
    },
    ["create","postCreate","byRegister","fetchByRegister","meta"],
);

export default endpoints;
export const CashRegisterTransactionEndpoints = endpoints;
