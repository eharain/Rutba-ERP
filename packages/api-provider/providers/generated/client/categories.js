import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { CategoriesEndpoints as CategoriesEndpointsApi } from '../../../api/categories.js';

async function updateDraft(documentId, data) {
    const ep = CategoriesEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(documentId) {
    const ep = CategoriesEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = CategoriesEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function create(data) {
    const ep = CategoriesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = CategoriesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function listPaged(page = 1, pageSize = 100, arg3 = {}) {
    const ep = CategoriesEndpointsApi.listPaged(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function listAll(arg1 = {}) {
    const ep = CategoriesEndpointsApi.listAll(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = CategoriesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listDraft(arg1 = {}) {
    const ep = CategoriesEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listPublished(arg1 = {}) {
    const ep = CategoriesEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = CategoriesEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = CategoriesEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function update(documentId, data) {
    const ep = CategoriesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function searchCategories(searchTerm, page = 1, rowsPerPage = 5) {
    const ep = CategoriesEndpointsApi.searchCategories(searchTerm, page, rowsPerPage);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'CategoriesEndpoints',
    {
        updateDraft,
        publish,
        unpublish,
        create,
        del,
        listPaged,
        listAll,
        list,
        listDraft,
        listPublished,
        byIdDraft,
        byIdPublished,
        update,
        searchCategories,
        meta: CategoriesEndpointsApi.meta,
    },
    ["updateDraft","publish","unpublish","create","del","listPaged","listAll","list","listDraft","listPublished","byIdDraft","byIdPublished","update","searchCategories","meta"],
);

export default endpoints;
export const CategoriesEndpoints = endpoints;
