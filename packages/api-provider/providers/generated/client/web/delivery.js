import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
import { WebDeliveryEndpoints as WebDeliveryEndpointsApi } from '../../../../api/web/delivery.js';

async function calculateMethods(...args) {
    return executeEndpoint(authApi, 'calculateMethods', WebDeliveryEndpointsApi.calculateMethods(...args));
}

async function getMessages(...args) {
    return executeEndpoint(authApi, 'getMessages', WebDeliveryEndpointsApi.getMessages(...args));
}

async function sendMessage(...args) {
    return executeEndpoint(authApi, 'sendMessage', WebDeliveryEndpointsApi.sendMessage(...args));
}

async function tracking(...args) {
    return executeEndpoint(authApi, 'tracking', WebDeliveryEndpointsApi.tracking(...args));
}

async function fetchGetMessages(...args) {
    return getMessages(...args);
}

const endpoints = {
    calculateMethods,
    getMessages,
    sendMessage,
    tracking,
    fetchGetMessages,
};

export default endpoints;
export const WebDeliveryEndpoints = endpoints;
