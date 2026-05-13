import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { HrTeamsEndpoints as HrTeamsEndpointsApi } from '../../../api/hr-teams.js';

async function list(arg1 = {}) {
    const ep = HrTeamsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function appRoleOptions() {
    const ep = HrTeamsEndpointsApi.appRoleOptions();
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrTeamsEndpointsApi.create(data);
    return authApi.fetch(ep.path, ep.params);
}

async function update(documentId, data) {
    const ep = HrTeamsEndpointsApi.update(documentId, data);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'HrTeamsEndpoints',
    {
        list,
        appRoleOptions,
        create,
        update,
    },
    ["list","appRoleOptions","create","update"],
);

export default endpoints;
export const HrTeamsEndpoints = endpoints;
