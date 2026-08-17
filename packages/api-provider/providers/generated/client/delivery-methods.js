import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { DeliveryMethodsEndpoints as DeliveryMethodsEndpointsApi } from '../../../api/delivery-methods.js';

async function updateDraft(documentId, data) {
    const ep = DeliveryMethodsEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function create(data) {
    const ep = DeliveryMethodsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = DeliveryMethodsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function list(arg1 = {}) {
    const ep = DeliveryMethodsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = DeliveryMethodsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = DeliveryMethodsEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = DeliveryMethodsEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function update(documentId, data) {
    const ep = DeliveryMethodsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'DeliveryMethodsEndpoints',
    {
        updateDraft,
        create,
        del,
        list,
        byId,
        byIdDraft,
        byIdPublished,
        update,
        meta: DeliveryMethodsEndpointsApi.meta,
    },
    ["updateDraft","create","del","list","byId","byIdDraft","byIdPublished","update","meta"],
);

export default endpoints;
export const DeliveryMethodsEndpoints = endpoints;
