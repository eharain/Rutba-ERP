import { webApi } from '../../../../lib/api.js';
import { strictEndpointGuard } from '../___core__.js';
import { WebCmsMenusEndpoints as WebCmsMenusEndpointsApi } from '../../../../api/web/cms-menus.js';

async function list() {
    const ep = WebCmsMenusEndpointsApi.list();
    return webApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'WebCmsMenusEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const WebCmsMenusEndpoints = endpoints;
