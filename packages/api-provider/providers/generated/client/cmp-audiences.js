import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { CmpAudiencesEndpoints as CmpAudiencesEndpointsApi } from '../../../api/cmp-audiences.js';

async function list(arg1 = {}) {
    const ep = CmpAudiencesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = CmpAudiencesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = CmpAudiencesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = CmpAudiencesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = CmpAudiencesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function resolveMembers(documentId) {
    const ep = CmpAudiencesEndpointsApi.resolveMembers(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'CmpAudiencesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        resolveMembers,
        meta: CmpAudiencesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","resolveMembers","meta"],
);

export default endpoints;
export const CmpAudiencesEndpoints = endpoints;
