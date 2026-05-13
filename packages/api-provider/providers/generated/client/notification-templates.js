import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { NotificationTemplatesEndpoints as NotificationTemplatesEndpointsApi } from '../../../api/notification-templates.js';

async function list(arg1 = {}) {
    const ep = NotificationTemplatesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = NotificationTemplatesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = NotificationTemplatesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = NotificationTemplatesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function remove(documentId) {
    const ep = NotificationTemplatesEndpointsApi.remove(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'NotificationTemplatesEndpoints',
    {
        list,
        byId,
        create,
        update,
        remove,
        meta: NotificationTemplatesEndpointsApi.meta,
    },
    ["list","byId","create","update","remove","meta"],
);

export default endpoints;
export const NotificationTemplatesEndpoints = endpoints;
