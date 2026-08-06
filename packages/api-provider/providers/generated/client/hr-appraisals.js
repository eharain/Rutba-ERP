import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrAppraisalsEndpoints as HrAppraisalsEndpointsApi } from '../../../api/hr-appraisals.js';

async function listMine() {
    const ep = HrAppraisalsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function listTeam() {
    const ep = HrAppraisalsEndpointsApi.listTeam();
    return authApi.fetch(ep.path, ep.params);
}

async function submitSelfAssessment(documentId, data) {
    const ep = HrAppraisalsEndpointsApi.submitSelfAssessment(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function submitManagerReview(documentId, data) {
    const ep = HrAppraisalsEndpointsApi.submitManagerReview(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function list(arg1 = {}) {
    const ep = HrAppraisalsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrAppraisalsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrAppraisalsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrAppraisalsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrAppraisalsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrAppraisalsEndpoints',
    {
        listMine,
        listTeam,
        submitSelfAssessment,
        submitManagerReview,
        list,
        byId,
        create,
        update,
        del,
        meta: HrAppraisalsEndpointsApi.meta,
    },
    ["listMine","listTeam","submitSelfAssessment","submitManagerReview","list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrAppraisalsEndpoints = endpoints;
