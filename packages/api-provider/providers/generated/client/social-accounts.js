import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SocialAccountsEndpoints as SocialAccountsEndpointsApi } from '../../../api/social-accounts.js';

async function list(arg1 = {}) {
    const ep = SocialAccountsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = SocialAccountsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = SocialAccountsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = SocialAccountsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'SocialAccountsEndpoints',
    {
        list,
        create,
        update,
        del,
    },
    ["list","create","update","del"],
);

export default endpoints;
export const SocialAccountsEndpoints = endpoints;
