import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { NotificationTemplatesEndpoints as NotificationTemplatesEndpointsApi } from '../../../api/notification-templates.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', NotificationTemplatesEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', NotificationTemplatesEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', NotificationTemplatesEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', NotificationTemplatesEndpointsApi.update(...args));
}

async function remove(...args) {
    return executeEndpoint(authApi, 'remove', NotificationTemplatesEndpointsApi.remove(...args));
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
