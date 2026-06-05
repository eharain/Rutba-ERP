import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { CmsMenusEndpoints as CmsMenusEndpointsApi } from '../../../api/cms-menus.js';

async function listDraft(arg1 = {}) {
    const ep = CmsMenusEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listPublished(arg1 = {}) {
    const ep = CmsMenusEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = CmsMenusEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = CmsMenusEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = CmsMenusEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = CmsMenusEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = CmsMenusEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = CmsMenusEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateDraft(documentId, data) {
    const ep = CmsMenusEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(documentId) {
    const ep = CmsMenusEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = CmsMenusEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = CmsMenusEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'CmsMenusEndpoints',
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
        meta: CmsMenusEndpointsApi.meta,
    },
    ["listDraft","listPublished","list","byIdDraft","byIdPublished","byId","create","update","updateDraft","publish","unpublish","del","meta"],
);

export default endpoints;
export const CmsMenusEndpoints = endpoints;
