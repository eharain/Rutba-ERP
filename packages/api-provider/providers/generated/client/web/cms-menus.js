import { webApi } from '../../../../lib/api.js';
import { epCtx, strictEndpointGuard } from '../___core__.js';
import { WebCmsMenusEndpoints as WebCmsMenusEndpointsApi } from '../../../../api/web/cms-menus.js';

async function list() {
    const ep = WebCmsMenusEndpointsApi.list();
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
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
