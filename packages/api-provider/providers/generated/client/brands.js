import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { BrandsEndpoints as BrandsEndpointsApi } from '../../../api/brands.js';

async function listPaged(page = 1, pageSize = 100, arg3 = {}) {
    const ep = BrandsEndpointsApi.listPaged(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function listAll(arg1 = {}) {
    const ep = BrandsEndpointsApi.listAll(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = BrandsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listDraft(arg1 = {}) {
    const ep = BrandsEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listPublished(arg1 = {}) {
    const ep = BrandsEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = BrandsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = BrandsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = BrandsEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = BrandsEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function updateDraft(documentId, data) {
    const ep = BrandsEndpointsApi.updateDraft(documentId, data);
    return authApi.fetch(ep.path, ep.params);
}

async function del(documentId) {
    const ep = BrandsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function publish(documentId) {
    const ep = BrandsEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = BrandsEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'BrandsEndpoints',
    {
        listPaged,
        listAll,
        list,
        listDraft,
        listPublished,
        create,
        update,
        byIdDraft,
        byIdPublished,
        updateDraft,
        del,
        publish,
        unpublish,
        meta: BrandsEndpointsApi.meta,
    },
    ["listPaged","listAll","list","listDraft","listPublished","create","update","byIdDraft","byIdPublished","updateDraft","del","publish","unpublish","meta"],
);

export default endpoints;
export const BrandsEndpoints = endpoints;
