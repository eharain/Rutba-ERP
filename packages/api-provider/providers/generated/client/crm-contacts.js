import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { CrmContactsEndpoints as CrmContactsEndpointsApi } from '../../../api/crm-contacts.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', CrmContactsEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', CrmContactsEndpointsApi.byId(...args));
}

const endpoints = strictEndpointGuard(
    'CrmContactsEndpoints',
    {
        list,
        byId,
    },
    ["list","byId"],
);

export default endpoints;
export const CrmContactsEndpoints = endpoints;
