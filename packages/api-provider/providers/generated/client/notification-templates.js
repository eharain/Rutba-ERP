import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
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

async function fetchList(...args) {
    return list(...args);
}

async function fetchById(...args) {
    return byId(...args);
}

async function postCreate(...args) {
    return create(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

async function deleteById(...args) {
    return remove(...args);
}

const endpoints = {
    list,
    byId,
    create,
    update,
    remove,
    fetchList,
    fetchById,
    postCreate,
    putUpdate,
    deleteById,
    meta: NotificationTemplatesEndpointsApi.meta,
};

export default endpoints;
export const NotificationTemplatesEndpoints = endpoints;
