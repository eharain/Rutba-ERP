import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { PayPayslipsEndpoints } from '@/api/pay-payslips.js';

export default createClientProxy(PayPayslipsEndpoints, authApi);
export const PayPayslipsEndpointsProxy = createClientProxy(PayPayslipsEndpoints, authApi);
