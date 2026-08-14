import { webApi } from '../../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from '../___core__.js';
import { WebDeliveryEndpoints as WebDeliveryEndpointsApi } from '../../../../api/web/delivery.js';

async function calculateMethods(data) {
    const ep = WebDeliveryEndpointsApi.calculateMethods(data);
    return webApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function getMessages(documentId) {
    const ep = WebDeliveryEndpointsApi.getMessages(documentId);
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function sendMessage(documentId, data) {
    const ep = WebDeliveryEndpointsApi.sendMessage(documentId, data);
    return webApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function tracking(documentId, secret) {
    const ep = WebDeliveryEndpointsApi.tracking(documentId, secret);
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'WebDeliveryEndpoints',
    {
        calculateMethods,
        getMessages,
        sendMessage,
        tracking,
    },
    ["calculateMethods","getMessages","sendMessage","tracking"],
);

export default endpoints;
export const WebDeliveryEndpoints = endpoints;
