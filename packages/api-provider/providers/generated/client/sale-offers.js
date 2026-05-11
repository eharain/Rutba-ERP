import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { SaleOffersEndpoints as SaleOffersEndpointsApi } from '../../../api/sale-offers.js';

async function listDraft(...args) {
    return executeEndpoint(authApi, 'listDraft', SaleOffersEndpointsApi.listDraft(...args));
}

async function listPublished(...args) {
    return executeEndpoint(authApi, 'listPublished', SaleOffersEndpointsApi.listPublished(...args));
}

async function byIdDraft(...args) {
    return executeEndpoint(authApi, 'byIdDraft', SaleOffersEndpointsApi.byIdDraft(...args));
}

async function byIdPublished(...args) {
    return executeEndpoint(authApi, 'byIdPublished', SaleOffersEndpointsApi.byIdPublished(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', SaleOffersEndpointsApi.create(...args));
}

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', SaleOffersEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', SaleOffersEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', SaleOffersEndpointsApi.unpublish(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', SaleOffersEndpointsApi.del(...args));
}

async function fetchListDraft(...args) {
    return listDraft(...args);
}

async function fetchListPublished(...args) {
    return listPublished(...args);
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

const endpoints = {
    listDraft,
    listPublished,
    byIdDraft,
    byIdPublished,
    create,
    updateDraft,
    publish,
    unpublish,
    del,
    fetchListDraft,
    fetchListPublished,
    fetchByIdDraft,
    fetchByIdPublished,
    postCreate,
};

export default endpoints;
export const SaleOffersEndpoints = endpoints;
