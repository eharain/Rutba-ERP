import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { ReturnRequestsEndpoints as ReturnRequestsEndpointsApi } from '../../../api/return-requests.js';

async function create(...args) {
    return executeEndpoint(authApi, 'create', ReturnRequestsEndpointsApi.create(...args));
}

const endpoints = strictEndpointGuard(
    'ReturnRequestsEndpoints',
    {
        create,
    },
    ["create"],
);

export default endpoints;
export const ReturnRequestsEndpoints = endpoints;
