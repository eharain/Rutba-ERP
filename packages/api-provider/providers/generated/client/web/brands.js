import { authApi } from '../../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from '../___core__.js';
import { WebBrandsEndpoints as WebBrandsEndpointsApi } from '../../../../api/web/brands.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', WebBrandsEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'WebBrandsEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const WebBrandsEndpoints = endpoints;
