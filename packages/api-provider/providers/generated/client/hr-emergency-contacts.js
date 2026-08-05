import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrEmergencyContactsEndpoints as HrEmergencyContactsEndpointsApi } from '../../../api/hr-emergency-contacts.js';

async function listMine() {
    const ep = HrEmergencyContactsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function createMine(data) {
    const ep = HrEmergencyContactsEndpointsApi.createMine(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateMine(documentId, data) {
    const ep = HrEmergencyContactsEndpointsApi.updateMine(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function deleteMine(documentId) {
    const ep = HrEmergencyContactsEndpointsApi.deleteMine(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrEmergencyContactsEndpoints',
    {
        listMine,
        createMine,
        updateMine,
        deleteMine,
        meta: HrEmergencyContactsEndpointsApi.meta,
    },
    ["listMine","createMine","updateMine","deleteMine","meta"],
);

export default endpoints;
export const HrEmergencyContactsEndpoints = endpoints;
