import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { MfgJobWorksEndpoints as MfgJobWorksEndpointsApi } from '../../../api/mfg-job-works.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = MfgJobWorksEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId) {
    const ep = MfgJobWorksEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = MfgJobWorksEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = MfgJobWorksEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = MfgJobWorksEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function dispatch(documentId) {
    const ep = MfgJobWorksEndpointsApi.dispatch(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function receive(documentId, lines) {
    const ep = MfgJobWorksEndpointsApi.receive(documentId, lines);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function cancel(documentId) {
    const ep = MfgJobWorksEndpointsApi.cancel(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function close(documentId) {
    const ep = MfgJobWorksEndpointsApi.close(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'MfgJobWorksEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        dispatch,
        receive,
        cancel,
        close,
        meta: MfgJobWorksEndpointsApi.meta,
    },
    ["list","byId","create","update","del","dispatch","receive","cancel","close","meta"],
);

export default endpoints;
export const MfgJobWorksEndpoints = endpoints;
