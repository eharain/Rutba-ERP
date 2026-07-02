import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { ProductsEndpoints as ProductsEndpointsApi } from '../../../api/products.js';

async function listPaged(page = 1, pageSize = 100, arg3 = {}) {
    const ep = ProductsEndpointsApi.listPaged(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function listAll(arg1 = {}) {
    const ep = ProductsEndpointsApi.listAll(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function list(page = 1, pageSize = 100, filters = {}) {
    const ep = ProductsEndpointsApi.list(page, pageSize, filters);
    return authApi.fetch(ep.path, ep.params);
}

async function search(searchText, page = 1, pageSize = 20) {
    const ep = ProductsEndpointsApi.search(searchText, page, pageSize);
    return authApi.fetch(ep.path, ep.params);
}

async function searchInRelation(searchText, page = 1, pageSize = 10) {
    const ep = ProductsEndpointsApi.searchInRelation(searchText, page, pageSize);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = ProductsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function save(id, data) {
    const ep = ProductsEndpointsApi.save(id, data);
    const __verb = (ep.method || 'get').toLowerCase();
    if (__verb === 'get') return authApi.fetch(ep.path, ep.params);
    if (__verb === 'delete') return authApi.del(withQuery(ep.path, ep.params));
    return authApi[__verb](withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function create(data) {
    const ep = ProductsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = ProductsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = ProductsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function searchByTerm(term, arg2 = {}) {
    const ep = ProductsEndpointsApi.searchByTerm(term, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function loadProduct(id) {
    const ep = ProductsEndpointsApi.loadProduct(id);
    return authApi.fetch(ep.path, ep.params);
}

async function byParent(parentDocId, arg2 = {}) {
    const ep = ProductsEndpointsApi.byParent(parentDocId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byParentDraft(parentDocId, arg2 = {}) {
    const ep = ProductsEndpointsApi.byParentDraft(parentDocId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdDraft(documentId, params = {}) {
    const ep = ProductsEndpointsApi.byIdDraft(documentId, params);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdPublished(documentId, params = {}) {
    const ep = ProductsEndpointsApi.byIdPublished(documentId, params);
    return authApi.fetch(ep.path, ep.params);
}

async function updateDraft(documentId, data) {
    const ep = ProductsEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(documentId) {
    const ep = ProductsEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = ProductsEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'ProductsEndpoints',
    {
        listPaged,
        listAll,
        list,
        search,
        searchInRelation,
        byId,
        save,
        create,
        update,
        del,
        searchByTerm,
        loadProduct,
        byParent,
        byParentDraft,
        byIdDraft,
        byIdPublished,
        updateDraft,
        publish,
        unpublish,
        meta: ProductsEndpointsApi.meta,
    },
    ["listPaged","listAll","list","search","searchInRelation","byId","save","create","update","del","searchByTerm","loadProduct","byParent","byParentDraft","byIdDraft","byIdPublished","updateDraft","publish","unpublish","meta"],
);

export default endpoints;
export const ProductsEndpoints = endpoints;
