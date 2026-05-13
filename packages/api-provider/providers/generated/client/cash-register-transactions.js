import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { CashRegisterTransactionEndpoints as CashRegisterTransactionEndpointsApi } from '../../../api/cash-register-transactions.js';

async function create(data) {
    const ep = CashRegisterTransactionEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function postCreate(data) {
    const ep = CashRegisterTransactionEndpointsApi.postCreate(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function byRegister(registerDocumentId, arg2 = {}) {
    const ep = CashRegisterTransactionEndpointsApi.byRegister(registerDocumentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function fetchByRegister(registerDocumentId, arg2 = {}) {
    const ep = CashRegisterTransactionEndpointsApi.fetchByRegister(registerDocumentId, arg2);
    return authApi.fetch(ep.path, ep.params);
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
