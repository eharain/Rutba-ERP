import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { CashRegistersEndpoints } from '@/api/cash-registers.js';

export default createClientProxy(CashRegistersEndpoints, authApi);
export const CashRegistersEndpointsProxy = createClientProxy(CashRegistersEndpoints, authApi);
