import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { SocialPostsEndpoints as SocialPostsEndpointsApi } from '../../../api/social-posts.js';

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', SocialPostsEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', SocialPostsEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', SocialPostsEndpointsApi.unpublish(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', SocialPostsEndpointsApi.create(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', SocialPostsEndpointsApi.del(...args));
}

async function list(...args) {
    return executeEndpoint(authApi, 'list', SocialPostsEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', SocialPostsEndpointsApi.byId(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', SocialPostsEndpointsApi.update(...args));
}

async function replies(...args) {
    return executeEndpoint(authApi, 'replies', SocialPostsEndpointsApi.replies(...args));
}

async function publishedMarker(...args) {
    return executeEndpoint(authApi, 'publishedMarker', SocialPostsEndpointsApi.publishedMarker(...args));
}

const endpoints = strictEndpointGuard(
    'SocialPostsEndpoints',
    {
        updateDraft,
        publish,
        unpublish,
        create,
        del,
        list,
        byId,
        update,
        replies,
        publishedMarker,
    },
    ["updateDraft","publish","unpublish","create","del","list","byId","update","replies","publishedMarker"],
);

export default endpoints;
export const SocialPostsEndpoints = endpoints;
