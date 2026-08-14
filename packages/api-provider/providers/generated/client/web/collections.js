import { webApi } from '../../../../lib/api.js';
import { epCtx, strictEndpointGuard } from '../___core__.js';
import { WebCollectionsEndpoints as WebCollectionsEndpointsApi } from '../../../../api/web/collections.js';

async function list() {
    const ep = WebCollectionsEndpointsApi.list();
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
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
