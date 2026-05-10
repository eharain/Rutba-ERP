import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { PayPayrollRunsEndpoints as PayPayrollRunsEndpointsApi } from '../api/pay-payroll-runs.js';

const endpoints = createClientProxy(PayPayrollRunsEndpointsApi, authApi);

export default endpoints;
export const PayPayrollRunsEndpoints = endpoints;

