import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { HrAttendancesEndpoints as HrAttendancesEndpointsApi } from '../api/hr-attendances.js';

const endpoints = createClientProxy(HrAttendancesEndpointsApi, authApi);

export default endpoints;
export const HrAttendancesEndpoints = endpoints;

