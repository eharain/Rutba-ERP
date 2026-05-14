import { api } from '../../../../lib/api.js';
import { strictEndpointGuard } from '../___core__.js';
import { WebBrandsEndpoints as WebBrandsEndpointsApi } from '../../../../api/web/brands.js';

async function list() {
    const ep = WebBrandsEndpointsApi.list();
    return api.fetch(ep.path, ep.params);
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
