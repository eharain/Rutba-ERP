import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HrGrievancesEndpoints as HrGrievancesEndpointsApi } from '../../../api/hr-grievances.js';

async function listMine() {
    const ep = HrGrievancesEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function submit(data) {
    const ep = HrGrievancesEndpointsApi.submit(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function listQueue() {
    const ep = HrGrievancesEndpointsApi.listQueue();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function resolve(documentId, data) {
    const ep = HrGrievancesEndpointsApi.resolve(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function list(arg1 = {}) {
    const ep = HrGrievancesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrGrievancesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = HrGrievancesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = HrGrievancesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = HrGrievancesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrGrievancesEndpoints',
    {
        listMine,
        submit,
        listQueue,
        resolve,
        list,
        byId,
        create,
        update,
        del,
        meta: HrGrievancesEndpointsApi.meta,
    },
    ["listMine","submit","listQueue","resolve","list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrGrievancesEndpoints = endpoints;
