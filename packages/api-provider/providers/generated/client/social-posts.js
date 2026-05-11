import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { SocialPostsEndpoints as SocialPostsEndpointsApi } from '../../../api/social-posts.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', SocialPostsEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', SocialPostsEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', SocialPostsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', SocialPostsEndpointsApi.update(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', SocialPostsEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', SocialPostsEndpointsApi.unpublish(...args));
}

async function replies(...args) {
    return executeEndpoint(authApi, 'replies', SocialPostsEndpointsApi.replies(...args));
}

async function fetchList(...args) {
    return list(...args);
}

async function fetchById(...args) {
    return byId(...args);
}

async function postCreate(...args) {
    return create(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    list,
    byId,
    create,
    update,
    publish,
    unpublish,
    replies,
    fetchList,
    fetchById,
    postCreate,
    putUpdate,
};

export default endpoints;
export const SocialPostsEndpoints = endpoints;
