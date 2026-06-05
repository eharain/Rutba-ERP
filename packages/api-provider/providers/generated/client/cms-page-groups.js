import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { CmsPageGroupsEndpoints as CmsPageGroupsEndpointsApi } from '../../../api/cms-page-groups.js';

async function listDraft(arg1 = {}) {
    const ep = CmsPageGroupsEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listPublished(arg1 = {}) {
    const ep = CmsPageGroupsEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = CmsPageGroupsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = CmsPageGroupsEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = CmsPageGroupsEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = CmsPageGroupsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = CmsPageGroupsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = CmsPageGroupsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateDraft(documentId, data) {
    const ep = CmsPageGroupsEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(documentId) {
    const ep = CmsPageGroupsEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = CmsPageGroupsEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = CmsPageGroupsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'CmsPageGroupsEndpoints',
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
        meta: CmsPageGroupsEndpointsApi.meta,
    },
    ["listDraft","listPublished","list","byIdDraft","byIdPublished","byId","create","update","updateDraft","publish","unpublish","del","meta"],
);

export default endpoints;
export const CmsPageGroupsEndpoints = endpoints;
