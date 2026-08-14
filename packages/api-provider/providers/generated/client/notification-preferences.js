import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { NotificationPreferencesEndpoints as NotificationPreferencesEndpointsApi } from '../../../api/notification-preferences.js';

async function list(arg1 = {}) {
    const ep = NotificationPreferencesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = NotificationPreferencesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = NotificationPreferencesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = NotificationPreferencesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'NotificationPreferencesEndpoints',
    {
        list,
        create,
        update,
        del,
        meta: NotificationPreferencesEndpointsApi.meta,
    },
    ["list","create","update","del","meta"],
);

export default endpoints;
export const NotificationPreferencesEndpoints = endpoints;
