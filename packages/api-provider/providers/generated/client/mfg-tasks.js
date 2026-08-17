import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { MfgTasksEndpoints as MfgTasksEndpointsApi } from '../../../api/mfg-tasks.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = MfgTasksEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId) {
    const ep = MfgTasksEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = MfgTasksEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = MfgTasksEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = MfgTasksEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function processTransition(documentId, status, extra = {}) {
    const ep = MfgTasksEndpointsApi.processTransition(documentId, status, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function approveTask(documentId, extra = {}) {
    const ep = MfgTasksEndpointsApi.approveTask(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function rejectTask(documentId, extra = {}) {
    const ep = MfgTasksEndpointsApi.rejectTask(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'MfgTasksEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        processTransition,
        approveTask,
        rejectTask,
        meta: MfgTasksEndpointsApi.meta,
    },
    ["list","byId","create","update","del","processTransition","approveTask","rejectTask","meta"],
);

export default endpoints;
export const MfgTasksEndpoints = endpoints;
