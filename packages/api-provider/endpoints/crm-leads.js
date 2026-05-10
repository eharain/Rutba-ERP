import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { CrmLeadsEndpoints as CrmLeadsEndpointsApi } from '../api/crm-leads.js';

const endpoints = createClientProxy(CrmLeadsEndpointsApi, authApi);

export default endpoints;
export const CrmLeadsEndpoints = endpoints;

