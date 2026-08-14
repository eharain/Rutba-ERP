import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { NotificationsEndpoints as NotificationsEndpointsApi } from '../../../api/notifications.js';

async function listMine(arg1 = {}) {
    const ep = NotificationsEndpointsApi.listMine(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function markAsRead(documentId) {
    const ep = NotificationsEndpointsApi.markAsRead(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'NotificationsEndpoints',
    {
        listMine,
        markAsRead,
        meta: NotificationsEndpointsApi.meta,
    },
    ["listMine","markAsRead","meta"],
);

export default endpoints;
export const NotificationsEndpoints = endpoints;
