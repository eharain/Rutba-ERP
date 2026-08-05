import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrBenefitPlansEndpoints as HrBenefitPlansEndpointsApi } from '../../../api/hr-benefit-plans.js';

async function list(arg1 = {}) {
    const ep = HrBenefitPlansEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrBenefitPlansEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrBenefitPlansEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrBenefitPlansEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'HrBenefitPlansEndpoints',
    {
        list,
        byId,
        create,
        update,
        meta: HrBenefitPlansEndpointsApi.meta,
    },
    ["list","byId","create","update","meta"],
);

export default endpoints;
export const HrBenefitPlansEndpoints = endpoints;
