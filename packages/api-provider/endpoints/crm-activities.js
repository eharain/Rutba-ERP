import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { CrmActivitiesEndpoints as CrmActivitiesEndpointsApi } from '../api/crm-activities.js';

const endpoints = createClientProxy(CrmActivitiesEndpointsApi, authApi);

export default endpoints;
export const CrmActivitiesEndpoints = endpoints;

