import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MfgMaterialIssuesEndpoints as MfgMaterialIssuesEndpointsApi } from '../../../api/mfg-material-issues.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = MfgMaterialIssuesEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = MfgMaterialIssuesEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function byWorkOrder(workOrderDocId, arg2 = {}) {
    const ep = MfgMaterialIssuesEndpointsApi.byWorkOrder(workOrderDocId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = MfgMaterialIssuesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = MfgMaterialIssuesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = MfgMaterialIssuesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'MfgMaterialIssuesEndpoints',
    {
        list,
        byId,
        byWorkOrder,
        create,
        update,
        del,
        meta: MfgMaterialIssuesEndpointsApi.meta,
    },
    ["list","byId","byWorkOrder","create","update","del","meta"],
);

export default endpoints;
export const MfgMaterialIssuesEndpoints = endpoints;
