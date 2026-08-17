import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { CrmSegmentsEndpoints as CrmSegmentsEndpointsApi } from '../../../api/crm-segments.js';

async function list(arg1 = {}) {
    const ep = CrmSegmentsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = CrmSegmentsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = CrmSegmentsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = CrmSegmentsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = CrmSegmentsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function listFields(arg1 = {}) {
    const ep = CrmSegmentsEndpointsApi.listFields(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function resolve(data) {
    const ep = CrmSegmentsEndpointsApi.resolve(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function listMembers(documentId, arg2 = {}) {
    const ep = CrmSegmentsEndpointsApi.listMembers(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listAudience(documentId, arg2 = {}) {
    const ep = CrmSegmentsEndpointsApi.listAudience(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function recomputeCount(documentId) {
    const ep = CrmSegmentsEndpointsApi.recomputeCount(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'CrmSegmentsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        listFields,
        resolve,
        listMembers,
        listAudience,
        recomputeCount,
        meta: CrmSegmentsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","listFields","resolve","listMembers","listAudience","recomputeCount","meta"],
);

export default endpoints;
export const CrmSegmentsEndpoints = endpoints;
