import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { MailServersEndpoints as MailServersEndpointsApi } from '../../../api/mail-servers.js';

async function list(arg1 = {}) {
    const ep = MailServersEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = MailServersEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = MailServersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = MailServersEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = MailServersEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function validateServer(arg1 = {}) {
    const ep = MailServersEndpointsApi.validateServer(arg1);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'MailServersEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        validateServer,
        meta: MailServersEndpointsApi.meta,
    },
    ["list","byId","create","update","del","validateServer","meta"],
);

export default endpoints;
export const MailServersEndpoints = endpoints;
