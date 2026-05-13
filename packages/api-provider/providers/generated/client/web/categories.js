import { authApi } from '../../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from '../___core__.js';
import { WebCategoriesEndpoints as WebCategoriesEndpointsApi } from '../../../../api/web/categories.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', WebCategoriesEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'WebCategoriesEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const WebCategoriesEndpoints = endpoints;
