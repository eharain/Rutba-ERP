import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SocialPostsEndpoints as SocialPostsEndpointsApi } from '../../../api/social-posts.js';

async function updateDraft(documentId, data) {
    const ep = SocialPostsEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publish(documentId) {
    const ep = SocialPostsEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function unpublish(documentId) {
    const ep = SocialPostsEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function create(data) {
    const ep = SocialPostsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = SocialPostsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function list(params = {}) {
    const ep = SocialPostsEndpointsApi.list(params);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, params = {}) {
    const ep = SocialPostsEndpointsApi.byId(documentId, params);
    return authApi.fetch(ep.path, ep.params);
}

async function update(documentId, data) {
    const ep = SocialPostsEndpointsApi.update(documentId, data);
    return authApi.fetch(ep.path, ep.params);
}

async function replies(documentId) {
    const ep = SocialPostsEndpointsApi.replies(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function publishedMarker() {
    const ep = SocialPostsEndpointsApi.publishedMarker();
    return authApi.fetch(ep.path, ep.params);
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
        meta: SocialPostsEndpointsApi.meta,
    },
    ["updateDraft","publish","unpublish","create","del","list","byId","update","replies","publishedMarker","meta"],
);

export default endpoints;
export const SocialPostsEndpoints = endpoints;
