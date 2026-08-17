import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { SocialAudioTracksEndpoints as SocialAudioTracksEndpointsApi } from '../../../api/social-audio-tracks.js';

async function list(arg1 = {}) {
    const ep = SocialAudioTracksEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function active(arg1 = {}) {
    const ep = SocialAudioTracksEndpointsApi.active(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = SocialAudioTracksEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = SocialAudioTracksEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = SocialAudioTracksEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = SocialAudioTracksEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'SocialAudioTracksEndpoints',
    {
        list,
        active,
        byId,
        create,
        update,
        del,
        meta: SocialAudioTracksEndpointsApi.meta,
    },
    ["list","active","byId","create","update","del","meta"],
);

export default endpoints;
export const SocialAudioTracksEndpoints = endpoints;
