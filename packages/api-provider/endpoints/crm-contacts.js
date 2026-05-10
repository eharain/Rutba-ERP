import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { CrmContactsEndpoints } from '@/api/crm-contacts.js';

export default createClientProxy(CrmContactsEndpoints, authApi);
export const CrmContactsEndpointsProxy = createClientProxy(CrmContactsEndpoints, authApi);
