import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
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

const endpoints = strictEndpointGuard(
    'SaleOffersEndpoints',
    {
        listDraft,
        listPublished,
        byIdDraft,
        byIdPublished,
        create,
        updateDraft,
        publish,
        unpublish,
        del,
    },
    ["listDraft","listPublished","byIdDraft","byIdPublished","create","updateDraft","publish","unpublish","del"],
);

export default endpoints;
export const SaleOffersEndpoints = endpoints;
