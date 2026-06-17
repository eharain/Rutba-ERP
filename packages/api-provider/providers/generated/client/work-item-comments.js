import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { WorkItemCommentsEndpoints as WorkItemCommentsEndpointsApi } from '../../../api/work-item-comments.js';

async function list(arg1 = {}) {
    const ep = WorkItemCommentsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = WorkItemCommentsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'WorkItemCommentsEndpoints',
    {
        list,
        create,
        meta: WorkItemCommentsEndpointsApi.meta,
    },
    ["list","create","meta"],
);

export default endpoints;
export const WorkItemCommentsEndpoints = endpoints;
