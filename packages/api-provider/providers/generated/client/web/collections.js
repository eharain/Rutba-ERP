import { authApi } from '../../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from '../___core__.js';
import { WebCollectionsEndpoints as WebCollectionsEndpointsApi } from '../../../../api/web/collections.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', WebCollectionsEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'WebCollectionsEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const WebCollectionsEndpoints = endpoints;
