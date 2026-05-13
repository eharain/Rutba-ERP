import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { SocialRepliesEndpoints as SocialRepliesEndpointsApi } from '../../../api/social-replies.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', SocialRepliesEndpointsApi.list(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', SocialRepliesEndpointsApi.del(...args));
}

const endpoints = strictEndpointGuard(
    'SocialRepliesEndpoints',
    {
        list,
        del,
    },
    ["list","del"],
);

export default endpoints;
export const SocialRepliesEndpoints = endpoints;
