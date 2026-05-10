import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { PaySalaryStructuresEndpoints as PaySalaryStructuresEndpointsApi } from '../api/pay-salary-structures.js';

const endpoints = createClientProxy(PaySalaryStructuresEndpointsApi, authApi);

export default endpoints;
export const PaySalaryStructuresEndpoints = endpoints;

