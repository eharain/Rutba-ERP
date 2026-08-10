import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { PersonsEndpoints as PersonsEndpointsApi } from '../../../api/persons.js';

async function list(arg1 = {}) {
    const ep = PersonsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = PersonsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'PersonsEndpoints',
    {
        list,
        byId,
        meta: PersonsEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const PersonsEndpoints = endpoints;
