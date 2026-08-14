import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HrEducationsEndpoints as HrEducationsEndpointsApi } from '../../../api/hr-educations.js';

async function listMine() {
    const ep = HrEducationsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function createMine(data) {
    const ep = HrEducationsEndpointsApi.createMine(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function updateMine(documentId, data) {
    const ep = HrEducationsEndpointsApi.updateMine(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function deleteMine(documentId) {
    const ep = HrEducationsEndpointsApi.deleteMine(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrEducationsEndpoints',
    {
        listMine,
        createMine,
        updateMine,
        deleteMine,
        meta: HrEducationsEndpointsApi.meta,
    },
    ["listMine","createMine","updateMine","deleteMine","meta"],
);

export default endpoints;
export const HrEducationsEndpoints = endpoints;
