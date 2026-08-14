import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { CmpTemplatesEndpoints as CmpTemplatesEndpointsApi } from '../../../api/cmp-templates.js';

async function list(arg1 = {}) {
    const ep = CmpTemplatesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = CmpTemplatesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = CmpTemplatesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = CmpTemplatesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = CmpTemplatesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function getPreview(documentId, arg2 = {}) {
    const ep = CmpTemplatesEndpointsApi.getPreview(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function sendTest(documentId, arg2 = {}) {
    const ep = CmpTemplatesEndpointsApi.sendTest(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function duplicateTemplate(documentId) {
    const ep = CmpTemplatesEndpointsApi.duplicateTemplate(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'CmpTemplatesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        getPreview,
        sendTest,
        duplicateTemplate,
        meta: CmpTemplatesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","getPreview","sendTest","duplicateTemplate","meta"],
);

export default endpoints;
export const CmpTemplatesEndpoints = endpoints;
