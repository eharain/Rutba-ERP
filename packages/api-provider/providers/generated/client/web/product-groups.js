import { authApi } from '../../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from '../___core__.js';
import { WebProductGroupsEndpoints as WebProductGroupsEndpointsApi } from '../../../../api/web/product-groups.js';

async function bySlug(...args) {
    return executeEndpoint(authApi, 'bySlug', WebProductGroupsEndpointsApi.bySlug(...args));
}

const endpoints = strictEndpointGuard(
    'WebProductGroupsEndpoints',
    {
        bySlug,
    },
    ["bySlug"],
);

export default endpoints;
export const WebProductGroupsEndpoints = endpoints;
