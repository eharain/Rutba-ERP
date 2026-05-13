import { authApi } from '../../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from '../___core__.js';
import { WebOrdersEndpoints as WebOrdersEndpointsApi } from '../../../../api/web/orders.js';

async function myOrders() {
    const ep = WebOrdersEndpointsApi.myOrders();
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = WebOrdersEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = WebOrdersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function validateAddress(data) {
    const ep = WebOrdersEndpointsApi.validateAddress(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function shippingRate(data) {
    const ep = WebOrdersEndpointsApi.shippingRate(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function calculateDelivery(data) {
    const ep = WebOrdersEndpointsApi.calculateDelivery(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function tracking(documentId, secret) {
    const ep = WebOrdersEndpointsApi.tracking(documentId, secret);
    return authApi.fetch(ep.path, ep.params);
}

async function messages(documentId) {
    const ep = WebOrdersEndpointsApi.messages(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function sendMessage(documentId, data) {
    const ep = WebOrdersEndpointsApi.sendMessage(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'WebOrdersEndpoints',
    {
        myOrders,
        byId,
        create,
        validateAddress,
        shippingRate,
        calculateDelivery,
        tracking,
        messages,
        sendMessage,
    },
    ["myOrders","byId","create","validateAddress","shippingRate","calculateDelivery","tracking","messages","sendMessage"],
);

export default endpoints;
export const WebOrdersEndpoints = endpoints;
