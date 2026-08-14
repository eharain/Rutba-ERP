import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HrFamilyMembersEndpoints as HrFamilyMembersEndpointsApi } from '../../../api/hr-family-members.js';

async function listMine() {
    const ep = HrFamilyMembersEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function createMine(data) {
    const ep = HrFamilyMembersEndpointsApi.createMine(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function updateMine(documentId, data) {
    const ep = HrFamilyMembersEndpointsApi.updateMine(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function deleteMine(documentId) {
    const ep = HrFamilyMembersEndpointsApi.deleteMine(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrFamilyMembersEndpoints',
    {
        listMine,
        createMine,
        updateMine,
        deleteMine,
        meta: HrFamilyMembersEndpointsApi.meta,
    },
    ["listMine","createMine","updateMine","deleteMine","meta"],
);

export default endpoints;
export const HrFamilyMembersEndpoints = endpoints;
