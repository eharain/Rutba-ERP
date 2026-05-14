import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { CrmContactsEndpoints as CrmContactsEndpointsApi } from '../../../api/crm-contacts.js';

async function list(arg1 = {}) {
    const ep = CrmContactsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = CrmContactsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'CrmContactsEndpoints',
    {
        list,
        byId,
        meta: CrmContactsEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const CrmContactsEndpoints = endpoints;
