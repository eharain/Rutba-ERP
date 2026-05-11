import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { PaymentsEndpoints as PaymentsEndpointsApi } from '../../../api/payments.js';

async function byRegister(...args) {
    return executeEndpoint(authApi, 'byRegister', PaymentsEndpointsApi.byRegister(...args));
}

async function fetchByRegister(...args) {
    return executeEndpoint(authApi, 'fetchByRegister', PaymentsEndpointsApi.fetchByRegister(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', PaymentsEndpointsApi.create(...args));
}

async function postCreate(...args) {
    return executeEndpoint(authApi, 'postCreate', PaymentsEndpointsApi.postCreate(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', PaymentsEndpointsApi.byId(...args));
}

async function fetchById(...args) {
    return executeEndpoint(authApi, 'fetchById', PaymentsEndpointsApi.fetchById(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', PaymentsEndpointsApi.update(...args));
}

async function putUpdate(...args) {
    return executeEndpoint(authApi, 'putUpdate', PaymentsEndpointsApi.putUpdate(...args));
}

async function createRefund(...args) {
    return executeEndpoint(authApi, 'createRefund', PaymentsEndpointsApi.createRefund(...args));
}

async function postRefund(...args) {
    return executeEndpoint(authApi, 'postRefund', PaymentsEndpointsApi.postRefund(...args));
}

const endpoints = {
    byRegister,
    fetchByRegister,
    create,
    postCreate,
    byId,
    fetchById,
    update,
    putUpdate,
    createRefund,
    postRefund,
    meta: PaymentsEndpointsApi.meta,
};

export default endpoints;
export const PaymentsEndpoints = endpoints;
