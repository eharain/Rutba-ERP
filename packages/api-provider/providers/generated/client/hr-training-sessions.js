import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HrTrainingSessionsEndpoints as HrTrainingSessionsEndpointsApi } from '../../../api/hr-training-sessions.js';

async function list(arg1 = {}) {
    const ep = HrTrainingSessionsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrTrainingSessionsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = HrTrainingSessionsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = HrTrainingSessionsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = HrTrainingSessionsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrTrainingSessionsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: HrTrainingSessionsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrTrainingSessionsEndpoints = endpoints;
