import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrCoursesEndpoints as HrCoursesEndpointsApi } from '../../../api/hr-courses.js';

async function list(arg1 = {}) {
    const ep = HrCoursesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrCoursesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrCoursesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrCoursesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrCoursesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrCoursesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: HrCoursesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrCoursesEndpoints = endpoints;
