import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { HrLeaveRequestsEndpoints as HrLeaveRequestsEndpointsApi } from '../api/hr-leave-requests.js';

const endpoints = createClientProxy(HrLeaveRequestsEndpointsApi, authApi);

export default endpoints;
export const HrLeaveRequestsEndpoints = endpoints;

