import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { WorkItemWatchesEndpoints as WorkItemWatchesEndpointsApi } from '../../../api/work-item-watches.js';

async function list(arg1 = {}) {
    const ep = WorkItemWatchesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function toggle(data) {
    const ep = WorkItemWatchesEndpointsApi.toggle(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'WorkItemWatchesEndpoints',
    {
        list,
        toggle,
        meta: WorkItemWatchesEndpointsApi.meta,
    },
    ["list","toggle","meta"],
);

export default endpoints;
export const WorkItemWatchesEndpoints = endpoints;
