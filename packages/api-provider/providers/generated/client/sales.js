import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { SalesEndpoints as SalesEndpointsApi } from '../../../api/sales.js';

async function list(page = 1, pageSize = 200, arg3 = {}) {
    const ep = SalesEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(idOrInvoice) {
    const ep = SalesEndpointsApi.byId(idOrInvoice);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function exchangeReturns(saleDocId) {
    const ep = SalesEndpointsApi.exchangeReturns(saleDocId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = SalesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = SalesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function cancel(documentId, data) {
    const ep = SalesEndpointsApi.cancel(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function checkout(documentId, data) {
    const ep = SalesEndpointsApi.checkout(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function markPayLater(documentId, data) {
    const ep = SalesEndpointsApi.markPayLater(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function unlockPayLater(documentId, data) {
    const ep = SalesEndpointsApi.unlockPayLater(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function saveNotes(documentId, notes) {
    const ep = SalesEndpointsApi.saveNotes(documentId, notes);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function searchByStockItem(term) {
    const ep = SalesEndpointsApi.searchByStockItem(term);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function searchByItemPrice(arg1 = {}) {
    const ep = SalesEndpointsApi.searchByItemPrice(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function sales(page, rowsPerPage = 200, arg3 = {}) {
    const ep = SalesEndpointsApi.sales(page, rowsPerPage, arg3);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function saleByIdOrInvoice(id) {
    const ep = SalesEndpointsApi.saleByIdOrInvoice(id);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'SalesEndpoints',
    {
        list,
        byId,
        exchangeReturns,
        create,
        update,
        cancel,
        checkout,
        markPayLater,
        unlockPayLater,
        saveNotes,
        searchByStockItem,
        searchByItemPrice,
        sales,
        saleByIdOrInvoice,
        meta: SalesEndpointsApi.meta,
    },
    ["list","byId","exchangeReturns","create","update","cancel","checkout","markPayLater","unlockPayLater","saveNotes","searchByStockItem","searchByItemPrice","sales","saleByIdOrInvoice","meta"],
);

export default endpoints;
export const SalesEndpoints = endpoints;
