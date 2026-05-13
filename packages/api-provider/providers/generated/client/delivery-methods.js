import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { DeliveryMethodsEndpoints as DeliveryMethodsEndpointsApi } from '../../../api/delivery-methods.js';

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', DeliveryMethodsEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', DeliveryMethodsEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', DeliveryMethodsEndpointsApi.unpublish(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', DeliveryMethodsEndpointsApi.create(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', DeliveryMethodsEndpointsApi.del(...args));
}

async function list(...args) {
    return executeEndpoint(authApi, 'list', DeliveryMethodsEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', DeliveryMethodsEndpointsApi.byId(...args));
}

async function byIdDraft(...args) {
    return executeEndpoint(authApi, 'byIdDraft', DeliveryMethodsEndpointsApi.byIdDraft(...args));
}

async function byIdPublished(...args) {
    return executeEndpoint(authApi, 'byIdPublished', DeliveryMethodsEndpointsApi.byIdPublished(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', DeliveryMethodsEndpointsApi.update(...args));
}

const endpoints = strictEndpointGuard(
    'DeliveryMethodsEndpoints',
    {
        updateDraft,
        publish,
        unpublish,
        create,
        del,
        list,
        byId,
        byIdDraft,
        byIdPublished,
        update,
    },
    ["updateDraft","publish","unpublish","create","del","list","byId","byIdDraft","byIdPublished","update"],
);

export default endpoints;
export const DeliveryMethodsEndpoints = endpoints;
