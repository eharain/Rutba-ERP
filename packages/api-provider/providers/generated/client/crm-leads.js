import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { CrmLeadsEndpoints as CrmLeadsEndpointsApi } from '../../../api/crm-leads.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', CrmLeadsEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', CrmLeadsEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', CrmLeadsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', CrmLeadsEndpointsApi.update(...args));
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
