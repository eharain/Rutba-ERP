import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { CashRegisterTransactionEndpoints } from '@/api/cash-register-transactions.js';

export default createClientProxy(CashRegisterTransactionEndpoints, authApi);
export const CashRegisterTransactionEndpointsProxy = createClientProxy(CashRegisterTransactionEndpoints, authApi);
