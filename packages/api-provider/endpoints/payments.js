import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { PaymentsEndpoints } from '@/api/payments.js';

export default createClientProxy(PaymentsEndpoints, authApi);
export const PaymentsEndpointsProxy = createClientProxy(PaymentsEndpoints, authApi);
