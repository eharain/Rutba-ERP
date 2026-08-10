import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SocialVideoTemplatesEndpoints as SocialVideoTemplatesEndpointsApi } from '../../../api/social-video-templates.js';

async function list(arg1 = {}) {
    const ep = SocialVideoTemplatesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = SocialVideoTemplatesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = SocialVideoTemplatesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = SocialVideoTemplatesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = SocialVideoTemplatesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'SocialVideoTemplatesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: SocialVideoTemplatesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const SocialVideoTemplatesEndpoints = endpoints;
