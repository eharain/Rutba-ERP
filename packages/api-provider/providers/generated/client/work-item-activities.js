import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { WorkItemActivitiesEndpoints as WorkItemActivitiesEndpointsApi } from '../../../api/work-item-activities.js';

async function list(arg1 = {}) {
    const ep = WorkItemActivitiesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function assign(data) {
    const ep = WorkItemActivitiesEndpointsApi.assign(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'WorkItemActivitiesEndpoints',
    {
        list,
        assign,
        meta: WorkItemActivitiesEndpointsApi.meta,
    },
    ["list","assign","meta"],
);

export default endpoints;
export const WorkItemActivitiesEndpoints = endpoints;
