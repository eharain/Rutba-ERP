import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { SocialAccountsEndpoints as SocialAccountsEndpointsApi } from '../../../api/social-accounts.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', SocialAccountsEndpointsApi.list(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', SocialAccountsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', SocialAccountsEndpointsApi.update(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', SocialAccountsEndpointsApi.del(...args));
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
