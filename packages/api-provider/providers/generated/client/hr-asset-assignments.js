import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrAssetAssignmentsEndpoints as HrAssetAssignmentsEndpointsApi } from '../../../api/hr-asset-assignments.js';

async function listMine() {
    const ep = HrAssetAssignmentsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function returnAsset(documentId, data) {
    const ep = HrAssetAssignmentsEndpointsApi.returnAsset(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function list(arg1 = {}) {
    const ep = HrAssetAssignmentsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrAssetAssignmentsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'HrAssetAssignmentsEndpoints',
    {
        listMine,
        returnAsset,
        list,
        byId,
        meta: HrAssetAssignmentsEndpointsApi.meta,
    },
    ["listMine","returnAsset","list","byId","meta"],
);

export default endpoints;
export const HrAssetAssignmentsEndpoints = endpoints;
