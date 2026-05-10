import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { AccExpensesEndpoints } from '@/api/acc-expenses.js';

export default createClientProxy(AccExpensesEndpoints, authApi);
export const AccExpensesEndpointsProxy = createClientProxy(AccExpensesEndpoints, authApi);
