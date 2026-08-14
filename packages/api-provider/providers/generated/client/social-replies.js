import { authApi } from '../../../lib/api.js';
import { withQuery, epCtx, strictEndpointGuard } from './___core__.js';
import { SocialRepliesEndpoints as SocialRepliesEndpointsApi } from '../../../api/social-replies.js';

async function list(arg1 = {}) {
    const ep = SocialRepliesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function del(documentId) {
    const ep = SocialRepliesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'SocialRepliesEndpoints',
    {
        list,
        del,
        meta: SocialRepliesEndpointsApi.meta,
    },
    ["list","del","meta"],
);

export default endpoints;
export const SocialRepliesEndpoints = endpoints;
