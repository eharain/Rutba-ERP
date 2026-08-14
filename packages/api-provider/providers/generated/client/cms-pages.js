import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { CmsPagesEndpoints as CmsPagesEndpointsApi } from '../../../api/cms-pages.js';

async function list(arg1 = {}) {
    const ep = CmsPagesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listDraft(arg1 = {}) {
    const ep = CmsPagesEndpointsApi.listDraft(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listPublished(arg1 = {}) {
    const ep = CmsPagesEndpointsApi.listPublished(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function bySlug(slug) {
    const ep = CmsPagesEndpointsApi.bySlug(slug);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function bySlugCheck(slug) {
    const ep = CmsPagesEndpointsApi.bySlugCheck(slug);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function headerData() {
    const ep = CmsPagesEndpointsApi.headerData();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byIdDraft(documentId, arg2 = {}) {
    const ep = CmsPagesEndpointsApi.byIdDraft(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byIdPublished(documentId, arg2 = {}) {
    const ep = CmsPagesEndpointsApi.byIdPublished(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function update(documentId, data) {
    const ep = CmsPagesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function updateDraft(documentId, data) {
    const ep = CmsPagesEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function publish(documentId) {
    const ep = CmsPagesEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function unpublish(documentId) {
    const ep = CmsPagesEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function create(data) {
    const ep = CmsPagesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = CmsPagesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'CmsPagesEndpoints',
    {
        list,
        listDraft,
        listPublished,
        bySlug,
        bySlugCheck,
        headerData,
        byIdDraft,
        byIdPublished,
        update,
        updateDraft,
        publish,
        unpublish,
        create,
        del,
        meta: CmsPagesEndpointsApi.meta,
    },
    ["list","listDraft","listPublished","bySlug","bySlugCheck","headerData","byIdDraft","byIdPublished","update","updateDraft","publish","unpublish","create","del","meta"],
);

export default endpoints;
export const CmsPagesEndpoints = endpoints;
