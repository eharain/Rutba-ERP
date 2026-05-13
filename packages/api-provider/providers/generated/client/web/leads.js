import { authApi } from '../../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from '../___core__.js';
import { WebLeadsEndpoints as WebLeadsEndpointsApi } from '../../../../api/web/leads.js';

async function create(...args) {
    return executeEndpoint(authApi, 'create', WebLeadsEndpointsApi.create(...args));
}

const endpoints = strictEndpointGuard(
    'WebLeadsEndpoints',
    {
        create,
    },
    ["create"],
);

export default endpoints;
export const WebLeadsEndpoints = endpoints;
