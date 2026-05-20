import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SaleOrdersEndpoints as SaleOrdersEndpointsApi } from '../../../api/sale-orders.js';

async function list(arg1 = {}) {
    const ep = SaleOrdersEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = SaleOrdersEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = SaleOrdersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = SaleOrdersEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateStatus(documentId, data) {
    const ep = SaleOrdersEndpointsApi.updateStatus(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function assignRider(documentId, data) {
    const ep = SaleOrdersEndpointsApi.assignRider(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function messages(documentId) {
    const ep = SaleOrdersEndpointsApi.messages(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function sendMessage(documentId, data) {
    const ep = SaleOrdersEndpointsApi.sendMessage(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function recordPayment(documentId, data) {
    const ep = SaleOrdersEndpointsApi.recordPayment(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function verifyPayment(documentId, data) {
    const ep = SaleOrdersEndpointsApi.verifyPayment(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'SaleOrdersEndpoints',
    {
        list,
        byId,
        create,
        update,
        updateStatus,
        assignRider,
        messages,
        sendMessage,
        recordPayment,
        verifyPayment,
        meta: SaleOrdersEndpointsApi.meta,
    },
    ["list","byId","create","update","updateStatus","assignRider","messages","sendMessage","recordPayment","verifyPayment","meta"],
);

export default endpoints;
export const SaleOrdersEndpoints = endpoints;
