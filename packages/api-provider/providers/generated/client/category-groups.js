import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { CategoryGroupsEndpoints as CategoryGroupsEndpointsApi } from '../../../api/category-groups.js';

async function listDraft(arg1 = {}) {
    const ep = CategoryGroupsEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listPublished(arg1 = {}) {
    const ep = CategoryGroupsEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = CategoryGroupsEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = CategoryGroupsEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function updateDraft(documentId, data) {
    const ep = CategoryGroupsEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(documentId) {
    const ep = CategoryGroupsEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = CategoryGroupsEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function create(data) {
    const ep = CategoryGroupsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = CategoryGroupsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'CategoryGroupsEndpoints',
    {
        listDraft,
        listPublished,
        byIdDraft,
        byIdPublished,
        updateDraft,
        publish,
        unpublish,
        create,
        del,
    },
    ["listDraft","listPublished","byIdDraft","byIdPublished","updateDraft","publish","unpublish","create","del"],
);

export default endpoints;
export const CategoryGroupsEndpoints = endpoints;
