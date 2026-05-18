import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SeoMetasEndpoints as SeoMetasEndpointsApi } from '../../../api/seo-metas.js';

async function list(arg1 = {}) {
    const ep = SeoMetasEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = SeoMetasEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function byCmsPage(cmsPageDocumentId) {
    const ep = SeoMetasEndpointsApi.byCmsPage(cmsPageDocumentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = SeoMetasEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = SeoMetasEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = SeoMetasEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'SeoMetasEndpoints',
    {
        list,
        byId,
        byCmsPage,
        create,
        update,
        del,
        meta: SeoMetasEndpointsApi.meta,
    },
    ["list","byId","byCmsPage","create","update","del","meta"],
);

export default endpoints;
export const SeoMetasEndpoints = endpoints;
