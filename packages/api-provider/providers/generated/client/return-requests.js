import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { ReturnRequestsEndpoints as ReturnRequestsEndpointsApi } from '../../../api/return-requests.js';

async function create(data) {
    const ep = ReturnRequestsEndpointsApi.create(data);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'ReturnRequestsEndpoints',
    {
        create,
        meta: ReturnRequestsEndpointsApi.meta,
    },
    ["create","meta"],
);

export default endpoints;
export const ReturnRequestsEndpoints = endpoints;
