import { authApi } from '../../../lib/api.js';
import { withQuery, strictEndpointGuard } from './___core__.js';
import { SocialRepliesEndpoints as SocialRepliesEndpointsApi } from '../../../api/social-replies.js';

async function list(arg1 = {}) {
    const ep = SocialRepliesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function del(documentId) {
    const ep = SocialRepliesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
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
