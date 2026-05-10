import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { NotificationTemplatesEndpoints as NotificationTemplatesEndpointsApi } from '../api/notification-templates.js';

const endpoints = createClientProxy(NotificationTemplatesEndpointsApi, authApi);

export default endpoints;
export const NotificationTemplatesEndpoints = endpoints;

