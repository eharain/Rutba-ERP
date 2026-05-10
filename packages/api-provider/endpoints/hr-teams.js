import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { HrTeamsEndpoints as HrTeamsEndpointsApi } from '../api/hr-teams.js';

const endpoints = createClientProxy(HrTeamsEndpointsApi, authApi);

export default endpoints;
export const HrTeamsEndpoints = endpoints;

