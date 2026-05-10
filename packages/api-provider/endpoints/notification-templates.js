import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { NotificationTemplatesEndpoints } from '@/api/notification-templates.js';

export default createClientProxy(NotificationTemplatesEndpoints, authApi);
export const NotificationTemplatesEndpointsProxy = createClientProxy(NotificationTemplatesEndpoints, authApi);
