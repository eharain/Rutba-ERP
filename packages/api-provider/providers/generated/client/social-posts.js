import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { SocialPostsEndpoints as SocialPostsEndpointsApi } from '../../../api/social-posts.js';

async function updateDraft(documentId, data) {
    const ep = SocialPostsEndpointsApi.updateDraft(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function publish(documentId) {
    const ep = SocialPostsEndpointsApi.publish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function unpublish(documentId) {
    const ep = SocialPostsEndpointsApi.unpublish(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function create(data) {
    const ep = SocialPostsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = SocialPostsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function list(params = {}) {
    const ep = SocialPostsEndpointsApi.list(params);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, params = {}) {
    const ep = SocialPostsEndpointsApi.byId(documentId, params);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function update(documentId, data) {
    const ep = SocialPostsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function replies(documentId) {
    const ep = SocialPostsEndpointsApi.replies(documentId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function publishSocial(documentId) {
    const ep = SocialPostsEndpointsApi.publishSocial(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function publishRelay(documentId, data = {}) {
    const ep = SocialPostsEndpointsApi.publishRelay(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function unpublishSocial(documentId) {
    const ep = SocialPostsEndpointsApi.unpublishSocial(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function syncReplies(documentId) {
    const ep = SocialPostsEndpointsApi.syncReplies(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function sendReply(documentId, data) {
    const ep = SocialPostsEndpointsApi.sendReply(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function duplicate(documentId) {
    const ep = SocialPostsEndpointsApi.duplicate(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function recordResult(documentId, data) {
    const ep = SocialPostsEndpointsApi.recordResult(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function publishedMarker() {
    const ep = SocialPostsEndpointsApi.publishedMarker();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
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
        publishSocial,
        publishRelay,
        unpublishSocial,
        syncReplies,
        sendReply,
        duplicate,
        recordResult,
        publishedMarker,
        meta: SocialPostsEndpointsApi.meta,
    },
    ["updateDraft","publish","unpublish","create","del","list","byId","update","replies","publishSocial","publishRelay","unpublishSocial","syncReplies","sendReply","duplicate","recordResult","publishedMarker","meta"],
);

export default endpoints;
export const SocialPostsEndpoints = endpoints;
