import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { CmsMenuItemsEndpoints as CmsMenuItemsEndpointsApi } from '../../../api/cms-menu-items.js';

async function listDraft(arg1 = {}) {
    const ep = CmsMenuItemsEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listPublished(arg1 = {}) {
    const ep = CmsMenuItemsEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function list(arg1 = {}) {
    const ep = CmsMenuItemsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = CmsMenuItemsEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = CmsMenuItemsEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = CmsMenuItemsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = CmsMenuItemsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = CmsMenuItemsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function updateDraft(documentId, data) {
    const ep = CmsMenuItemsEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function publish(documentId) {
    const ep = CmsMenuItemsEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function unpublish(documentId) {
    const ep = CmsMenuItemsEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = CmsMenuItemsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'CmsMenuItemsEndpoints',
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
        meta: CmsMenuItemsEndpointsApi.meta,
    },
    ["listDraft","listPublished","list","byIdDraft","byIdPublished","byId","create","update","updateDraft","publish","unpublish","del","meta"],
);

export default endpoints;
export const CmsMenuItemsEndpoints = endpoints;
