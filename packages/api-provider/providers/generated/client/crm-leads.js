import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { CrmLeadsEndpoints as CrmLeadsEndpointsApi } from '../../../api/crm-leads.js';

async function list(arg1 = {}) {
    const ep = CrmLeadsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = CrmLeadsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = CrmLeadsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = CrmLeadsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'CrmLeadsEndpoints',
    {
        list,
        byId,
        create,
        update,
        meta: CrmLeadsEndpointsApi.meta,
    },
    ["list","byId","create","update","meta"],
);

export default endpoints;
export const CrmLeadsEndpoints = endpoints;
