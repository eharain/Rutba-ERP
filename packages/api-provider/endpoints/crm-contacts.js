import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { CrmContactsEndpoints as CrmContactsEndpointsApi } from '../api/crm-contacts.js';

const endpoints = createClientProxy(CrmContactsEndpointsApi, authApi);

export default endpoints;
export const CrmContactsEndpoints = endpoints;

