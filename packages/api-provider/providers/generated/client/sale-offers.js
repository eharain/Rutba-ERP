import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { SaleOffersEndpoints as SaleOffersEndpointsApi } from '../../../api/sale-offers.js';

async function listOffersForProduct(productDocumentId) {
    const ep = SaleOffersEndpointsApi.listOffersForProduct(productDocumentId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listDraft(arg1 = {}) {
    const ep = SaleOffersEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listPublished(arg1 = {}) {
    const ep = SaleOffersEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = SaleOffersEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = SaleOffersEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = SaleOffersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function updateDraft(documentId, data) {
    const ep = SaleOffersEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function publish(documentId) {
    const ep = SaleOffersEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function unpublish(documentId) {
    const ep = SaleOffersEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = SaleOffersEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'SaleOffersEndpoints',
    {
        listOffersForProduct,
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
    ["listOffersForProduct","listDraft","listPublished","byIdDraft","byIdPublished","create","updateDraft","publish","unpublish","del","meta"],
);

export default endpoints;
export const SaleOffersEndpoints = endpoints;
