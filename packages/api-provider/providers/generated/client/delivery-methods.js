import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { DeliveryMethodsEndpoints as DeliveryMethodsEndpointsApi } from '../../../api/delivery-methods.js';

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

async function create(...args) {
    return executeEndpoint(authApi, 'create', DeliveryMethodsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', DeliveryMethodsEndpointsApi.update(...args));
}

async function fetchList(...args) {
    return list(...args);
}

async function fetchById(...args) {
    return byId(...args);
}

async function fetchByIdDraft(...args) {
    return byIdDraft(...args);
}

async function fetchByIdPublished(...args) {
    return byIdPublished(...args);
}

async function postCreate(...args) {
    return create(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    list,
    byId,
    byIdDraft,
    byIdPublished,
    create,
    update,
    fetchList,
    fetchById,
    fetchByIdDraft,
    fetchByIdPublished,
    postCreate,
    putUpdate,
};

export default endpoints;
export const DeliveryMethodsEndpoints = endpoints;
