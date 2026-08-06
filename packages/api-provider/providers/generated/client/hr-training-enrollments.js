import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrTrainingEnrollmentsEndpoints as HrTrainingEnrollmentsEndpointsApi } from '../../../api/hr-training-enrollments.js';

async function listMine() {
    const ep = HrTrainingEnrollmentsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function enroll(data) {
    const ep = HrTrainingEnrollmentsEndpointsApi.enroll(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function complete(documentId, data) {
    const ep = HrTrainingEnrollmentsEndpointsApi.complete(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function list(arg1 = {}) {
    const ep = HrTrainingEnrollmentsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrTrainingEnrollmentsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrTrainingEnrollmentsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrTrainingEnrollmentsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrTrainingEnrollmentsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrTrainingEnrollmentsEndpoints',
    {
        listMine,
        enroll,
        complete,
        list,
        byId,
        create,
        update,
        del,
        meta: HrTrainingEnrollmentsEndpointsApi.meta,
    },
    ["listMine","enroll","complete","list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrTrainingEnrollmentsEndpoints = endpoints;
