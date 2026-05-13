import { authApi } from '../../../../lib/api.js';
import { strictEndpointGuard } from '../___core__.js';
import { WebCategoriesEndpoints as WebCategoriesEndpointsApi } from '../../../../api/web/categories.js';

async function list() {
    const ep = WebCategoriesEndpointsApi.list();
    return authApi.fetch(ep.path, ep.params);
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
