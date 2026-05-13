import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { RidersEndpoints as RidersEndpointsApi } from '../../../api/riders.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', RidersEndpointsApi.list(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', RidersEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', RidersEndpointsApi.update(...args));
}

const endpoints = strictEndpointGuard(
    'RidersEndpoints',
    {
        list,
        create,
        update,
        meta: RidersEndpointsApi.meta,
    },
    ["list","create","update","meta"],
);

export default endpoints;
export const RidersEndpoints = endpoints;
