import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { EnumsEndpoints as EnumsEndpointsApi } from '../../../api/enums.js';

async function values(...args) {
    return executeEndpoint(authApi, 'values', EnumsEndpointsApi.values(...args));
}

const endpoints = strictEndpointGuard(
    'EnumsEndpoints',
    {
        values,
        meta: EnumsEndpointsApi.meta,
    },
    ["values","meta"],
);

export default endpoints;
export const EnumsEndpoints = endpoints;
