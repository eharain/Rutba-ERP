import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrEmployeeDocumentsEndpoints as HrEmployeeDocumentsEndpointsApi } from '../../../api/hr-employee-documents.js';

async function listMine() {
    const ep = HrEmployeeDocumentsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function createMine(data) {
    const ep = HrEmployeeDocumentsEndpointsApi.createMine(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateMine(documentId, data) {
    const ep = HrEmployeeDocumentsEndpointsApi.updateMine(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function deleteMine(documentId) {
    const ep = HrEmployeeDocumentsEndpointsApi.deleteMine(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrEmployeeDocumentsEndpoints',
    {
        listMine,
        createMine,
        updateMine,
        deleteMine,
        meta: HrEmployeeDocumentsEndpointsApi.meta,
    },
    ["listMine","createMine","updateMine","deleteMine","meta"],
);

export default endpoints;
export const HrEmployeeDocumentsEndpoints = endpoints;
