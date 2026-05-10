import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { CrmActivitiesEndpoints } from '@/api/crm-activities.js';

export default createClientProxy(CrmActivitiesEndpoints, authApi);
export const CrmActivitiesEndpointsProxy = createClientProxy(CrmActivitiesEndpoints, authApi);
