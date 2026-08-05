import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrWorkExperiencesEndpoints as HrWorkExperiencesEndpointsApi } from '../../../api/hr-work-experiences.js';

async function listMine() {
    const ep = HrWorkExperiencesEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function createMine(data) {
    const ep = HrWorkExperiencesEndpointsApi.createMine(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateMine(documentId, data) {
    const ep = HrWorkExperiencesEndpointsApi.updateMine(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function deleteMine(documentId) {
    const ep = HrWorkExperiencesEndpointsApi.deleteMine(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrWorkExperiencesEndpoints',
    {
        listMine,
        createMine,
        updateMine,
        deleteMine,
        meta: HrWorkExperiencesEndpointsApi.meta,
    },
    ["listMine","createMine","updateMine","deleteMine","meta"],
);

export default endpoints;
export const HrWorkExperiencesEndpoints = endpoints;
