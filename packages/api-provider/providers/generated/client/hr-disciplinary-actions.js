import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrDisciplinaryActionsEndpoints as HrDisciplinaryActionsEndpointsApi } from '../../../api/hr-disciplinary-actions.js';

async function list(arg1 = {}) {
    const ep = HrDisciplinaryActionsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrDisciplinaryActionsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrDisciplinaryActionsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrDisciplinaryActionsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrDisciplinaryActionsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrDisciplinaryActionsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: HrDisciplinaryActionsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrDisciplinaryActionsEndpoints = endpoints;
