import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { PayPayslipsEndpoints as PayPayslipsEndpointsApi } from '../api/pay-payslips.js';

const endpoints = createClientProxy(PayPayslipsEndpointsApi, authApi);

export default endpoints;
export const PayPayslipsEndpoints = endpoints;

