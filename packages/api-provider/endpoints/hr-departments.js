import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { HrDepartmentsEndpoints as HrDepartmentsEndpointsApi } from '../api/hr-departments.js';

const endpoints = createClientProxy(HrDepartmentsEndpointsApi, authApi);

export default endpoints;
export const HrDepartmentsEndpoints = endpoints;

