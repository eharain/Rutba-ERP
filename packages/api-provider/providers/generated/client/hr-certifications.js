import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HrCertificationsEndpoints as HrCertificationsEndpointsApi } from '../../../api/hr-certifications.js';

async function listMine() {
    const ep = HrCertificationsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function createMine(data) {
    const ep = HrCertificationsEndpointsApi.createMine(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function updateMine(documentId, data) {
    const ep = HrCertificationsEndpointsApi.updateMine(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function deleteMine(documentId) {
    const ep = HrCertificationsEndpointsApi.deleteMine(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrCertificationsEndpoints',
    {
        listMine,
        createMine,
        updateMine,
        deleteMine,
        meta: HrCertificationsEndpointsApi.meta,
    },
    ["listMine","createMine","updateMine","deleteMine","meta"],
);

export default endpoints;
export const HrCertificationsEndpoints = endpoints;
