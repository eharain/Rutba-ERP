import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { MailTagsEndpoints as MailTagsEndpointsApi } from '../../../api/mail-tags.js';

async function list() {
    const ep = MailTagsEndpointsApi.list();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId) {
    const ep = MailTagsEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = MailTagsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = MailTagsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = MailTagsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'MailTagsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: MailTagsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const MailTagsEndpoints = endpoints;
