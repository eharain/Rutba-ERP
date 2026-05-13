import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { PaymentsEndpoints as PaymentsEndpointsApi } from '../../../api/payments.js';

async function byRegister(registerId, arg2 = {}) {
    const ep = PaymentsEndpointsApi.byRegister(registerId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function fetchByRegister(registerId, opts = {}) {
    const ep = PaymentsEndpointsApi.fetchByRegister(registerId, opts);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = PaymentsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function postCreate(data) {
    const ep = PaymentsEndpointsApi.postCreate(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function byId(documentId, arg2 = {}) {
    const ep = PaymentsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function fetchById(documentId, arg2 = {}) {
    const ep = PaymentsEndpointsApi.fetchById(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function update(documentId, data) {
    const ep = PaymentsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function putUpdate(documentId, data) {
    const ep = PaymentsEndpointsApi.putUpdate(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function createRefund() {
    const ep = PaymentsEndpointsApi.createRefund();
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function postRefund(data) {
    const ep = PaymentsEndpointsApi.postRefund(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'PaymentsEndpoints',
    {
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
    },
    ["byRegister","fetchByRegister","create","postCreate","byId","fetchById","update","putUpdate","createRefund","postRefund","meta"],
);

export default endpoints;
export const PaymentsEndpoints = endpoints;
