import { authApi } from '../../../lib/api.js';
import { withQuery, strictEndpointGuard } from './___core__.js';
import { SaleOffersEndpoints as SaleOffersEndpointsApi } from '../../../api/sale-offers.js';

async function listDraft(arg1 = {}) {
    const ep = SaleOffersEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listPublished(arg1 = {}) {
    const ep = SaleOffersEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = SaleOffersEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = SaleOffersEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = SaleOffersEndpointsApi.create(data);
    return authApi.fetch(ep.path, ep.params);
}

async function updateDraft(documentId, data) {
    const ep = SaleOffersEndpointsApi.updateDraft(documentId, data);
    return authApi.fetch(ep.path, ep.params);
}

async function publish(documentId) {
    const ep = SaleOffersEndpointsApi.publish(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function unpublish(documentId) {
    const ep = SaleOffersEndpointsApi.unpublish(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function del(documentId) {
    const ep = SaleOffersEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
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
        meta: SaleOffersEndpointsApi.meta,
    },
    ["listDraft","listPublished","byIdDraft","byIdPublished","create","updateDraft","publish","unpublish","del","meta"],
);

export default endpoints;
export const SaleOffersEndpoints = endpoints;
