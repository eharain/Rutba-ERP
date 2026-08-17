import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { CategoryGroupsEndpoints as CategoryGroupsEndpointsApi } from '../../../api/category-groups.js';

async function listDraft(arg1 = {}) {
    const ep = CategoryGroupsEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listPublished(arg1 = {}) {
    const ep = CategoryGroupsEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = CategoryGroupsEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = CategoryGroupsEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function updateDraft(documentId, data) {
    const ep = CategoryGroupsEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function publish(documentId) {
    const ep = CategoryGroupsEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function unpublish(documentId) {
    const ep = CategoryGroupsEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function create(data) {
    const ep = CategoryGroupsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = CategoryGroupsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
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
        meta: CategoryGroupsEndpointsApi.meta,
    },
    ["listDraft","listPublished","byIdDraft","byIdPublished","updateDraft","publish","unpublish","create","del","meta"],
);

export default endpoints;
export const CategoryGroupsEndpoints = endpoints;
