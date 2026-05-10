import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { PayPayrollRunsEndpoints } from '@/api/pay-payroll-runs.js';

export default createClientProxy(PayPayrollRunsEndpoints, authApi);
export const PayPayrollRunsEndpointsProxy = createClientProxy(PayPayrollRunsEndpoints, authApi);
