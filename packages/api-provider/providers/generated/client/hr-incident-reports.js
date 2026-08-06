import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrIncidentReportsEndpoints as HrIncidentReportsEndpointsApi } from '../../../api/hr-incident-reports.js';

async function report(data) {
    const ep = HrIncidentReportsEndpointsApi.report(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listMine() {
    const ep = HrIncidentReportsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = HrIncidentReportsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrIncidentReportsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrIncidentReportsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrIncidentReportsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrIncidentReportsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrIncidentReportsEndpoints',
    {
        report,
        listMine,
        list,
        byId,
        create,
        update,
        del,
        meta: HrIncidentReportsEndpointsApi.meta,
    },
    ["report","listMine","list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrIncidentReportsEndpoints = endpoints;
