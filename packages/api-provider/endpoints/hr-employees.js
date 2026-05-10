import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { HrEmployeesEndpoints as HrEmployeesEndpointsApi } from '../api/hr-employees.js';

const endpoints = createClientProxy(HrEmployeesEndpointsApi, authApi);

export default endpoints;
export const HrEmployeesEndpoints = endpoints;

