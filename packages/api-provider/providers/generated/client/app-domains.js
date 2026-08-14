import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { AppDomainsEndpoints as AppDomainsEndpointsApi } from '../../../api/app-domains.js';

async function list() {
    const ep = AppDomainsEndpointsApi.list();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = AppDomainsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(id) {
    const ep = AppDomainsEndpointsApi.del(id);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'AppDomainsEndpoints',
    {
        list,
        create,
        del,
        meta: AppDomainsEndpointsApi.meta,
    },
    ["list","create","del","meta"],
);

export default endpoints;
export const AppDomainsEndpoints = endpoints;
