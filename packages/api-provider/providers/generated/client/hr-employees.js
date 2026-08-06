import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrEmployeesEndpoints as HrEmployeesEndpointsApi } from '../../../api/hr-employees.js';

async function getMyProfile() {
    const ep = HrEmployeesEndpointsApi.getMyProfile();
    return authApi.fetch(ep.path, ep.params);
}

async function updateMyProfile(data) {
    const ep = HrEmployeesEndpointsApi.updateMyProfile(data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function getDashboard() {
    const ep = HrEmployeesEndpointsApi.getDashboard();
    return authApi.fetch(ep.path, ep.params);
}

async function getOrgChart(arg1 = {}) {
    const ep = HrEmployeesEndpointsApi.getOrgChart(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listWithoutReportingLine() {
    const ep = HrEmployeesEndpointsApi.listWithoutReportingLine();
    return authApi.fetch(ep.path, ep.params);
}

async function runReportingLineBackfill(dryRun = true) {
    const ep = HrEmployeesEndpointsApi.runReportingLineBackfill(dryRun);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function list(arg1 = {}) {
    const ep = HrEmployeesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrEmployeesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrEmployeesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrEmployeesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'HrEmployeesEndpoints',
    {
        getMyProfile,
        updateMyProfile,
        getDashboard,
        getOrgChart,
        listWithoutReportingLine,
        runReportingLineBackfill,
        list,
        byId,
        create,
        update,
        meta: HrEmployeesEndpointsApi.meta,
    },
    ["getMyProfile","updateMyProfile","getDashboard","getOrgChart","listWithoutReportingLine","runReportingLineBackfill","list","byId","create","update","meta"],
);

export default endpoints;
export const HrEmployeesEndpoints = endpoints;
