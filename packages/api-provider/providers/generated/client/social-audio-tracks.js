import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SocialAudioTracksEndpoints as SocialAudioTracksEndpointsApi } from '../../../api/social-audio-tracks.js';

async function list(arg1 = {}) {
    const ep = SocialAudioTracksEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function active(arg1 = {}) {
    const ep = SocialAudioTracksEndpointsApi.active(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = SocialAudioTracksEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = SocialAudioTracksEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = SocialAudioTracksEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = SocialAudioTracksEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
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
