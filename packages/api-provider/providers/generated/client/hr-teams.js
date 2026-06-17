import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrTeamsEndpoints as HrTeamsEndpointsApi } from '../../../api/hr-teams.js';

async function list(arg1 = {}) {
    const ep = HrTeamsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getAppRoleOptions() {
    const ep = HrTeamsEndpointsApi.getAppRoleOptions();
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrTeamsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrTeamsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'HrTeamsEndpoints',
    {
        list,
        getAppRoleOptions,
        create,
        update,
        meta: HrTeamsEndpointsApi.meta,
    },
    ["list","getAppRoleOptions","create","update","meta"],
);

export default endpoints;
export const HrTeamsEndpoints = endpoints;
