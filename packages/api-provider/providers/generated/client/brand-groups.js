import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { BrandGroupsEndpoints as BrandGroupsEndpointsApi } from '../../../api/brand-groups.js';

async function listDraft(arg1 = {}) {
    const ep = BrandGroupsEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listPublished(arg1 = {}) {
    const ep = BrandGroupsEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = BrandGroupsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = BrandGroupsEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = BrandGroupsEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = BrandGroupsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = BrandGroupsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = BrandGroupsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateDraft(documentId, data) {
    const ep = BrandGroupsEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(documentId) {
    const ep = BrandGroupsEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = BrandGroupsEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = BrandGroupsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'BrandGroupsEndpoints',
    {
        listDraft,
        listPublished,
        list,
        byIdDraft,
        byIdPublished,
        byId,
        create,
        update,
        updateDraft,
        publish,
        unpublish,
        del,
        meta: BrandGroupsEndpointsApi.meta,
    },
    ["listDraft","listPublished","list","byIdDraft","byIdPublished","byId","create","update","updateDraft","publish","unpublish","del","meta"],
);

export default endpoints;
export const BrandGroupsEndpoints = endpoints;
