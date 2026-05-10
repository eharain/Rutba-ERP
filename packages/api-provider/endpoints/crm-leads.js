import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { CrmLeadsEndpoints } from '@/api/crm-leads.js';

export default createClientProxy(CrmLeadsEndpoints, authApi);
export const CrmLeadsEndpointsProxy = createClientProxy(CrmLeadsEndpoints, authApi);
