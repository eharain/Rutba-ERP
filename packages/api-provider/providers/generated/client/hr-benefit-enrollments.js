import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HrBenefitEnrollmentsEndpoints as HrBenefitEnrollmentsEndpointsApi } from '../../../api/hr-benefit-enrollments.js';

async function listMine() {
    const ep = HrBenefitEnrollmentsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function list(arg1 = {}) {
    const ep = HrBenefitEnrollmentsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrBenefitEnrollmentsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = HrBenefitEnrollmentsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = HrBenefitEnrollmentsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrBenefitEnrollmentsEndpoints',
    {
        listMine,
        list,
        byId,
        create,
        update,
        meta: HrBenefitEnrollmentsEndpointsApi.meta,
    },
    ["listMine","list","byId","create","update","meta"],
);

export default endpoints;
export const HrBenefitEnrollmentsEndpoints = endpoints;
