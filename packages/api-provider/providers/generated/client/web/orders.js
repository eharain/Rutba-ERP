import { authApi } from '../../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from '../___core__.js';
import { WebOrdersEndpoints as WebOrdersEndpointsApi } from '../../../../api/web/orders.js';

async function myOrders(...args) {
    return executeEndpoint(authApi, 'myOrders', WebOrdersEndpointsApi.myOrders(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', WebOrdersEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', WebOrdersEndpointsApi.create(...args));
}

async function validateAddress(...args) {
    return executeEndpoint(authApi, 'validateAddress', WebOrdersEndpointsApi.validateAddress(...args));
}

async function shippingRate(...args) {
    return executeEndpoint(authApi, 'shippingRate', WebOrdersEndpointsApi.shippingRate(...args));
}

async function calculateDelivery(...args) {
    return executeEndpoint(authApi, 'calculateDelivery', WebOrdersEndpointsApi.calculateDelivery(...args));
}

async function tracking(...args) {
    return executeEndpoint(authApi, 'tracking', WebOrdersEndpointsApi.tracking(...args));
}

async function messages(...args) {
    return executeEndpoint(authApi, 'messages', WebOrdersEndpointsApi.messages(...args));
}

async function sendMessage(...args) {
    return executeEndpoint(authApi, 'sendMessage', WebOrdersEndpointsApi.sendMessage(...args));
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
