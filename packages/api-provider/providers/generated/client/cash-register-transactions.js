import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { CashRegisterTransactionEndpoints as CashRegisterTransactionEndpointsApi } from '../../../api/cash-register-transactions.js';

async function create(...args) {
    return executeEndpoint(authApi, 'create', CashRegisterTransactionEndpointsApi.create(...args));
}

async function postCreate(...args) {
    return executeEndpoint(authApi, 'postCreate', CashRegisterTransactionEndpointsApi.postCreate(...args));
}

async function byRegister(...args) {
    return executeEndpoint(authApi, 'byRegister', CashRegisterTransactionEndpointsApi.byRegister(...args));
}

async function fetchByRegister(...args) {
    return executeEndpoint(authApi, 'fetchByRegister', CashRegisterTransactionEndpointsApi.fetchByRegister(...args));
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
