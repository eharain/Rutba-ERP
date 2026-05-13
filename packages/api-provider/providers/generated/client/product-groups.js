import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { ProductGroupsEndpoints as ProductGroupsEndpointsApi } from '../../../api/product-groups.js';

async function listDraft(arg1 = {}) {
    const ep = ProductGroupsEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listPublished(arg1 = {}) {
    const ep = ProductGroupsEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = ProductGroupsEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = ProductGroupsEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = ProductGroupsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateDraft(documentId, data) {
    const ep = ProductGroupsEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(documentId) {
    const ep = ProductGroupsEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = ProductGroupsEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = ProductGroupsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'ProductGroupsEndpoints',
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
        meta: ProductGroupsEndpointsApi.meta,
    },
    ["listDraft","listPublished","byIdDraft","byIdPublished","create","updateDraft","publish","unpublish","del","meta"],
);

export default endpoints;
export const ProductGroupsEndpoints = endpoints;
