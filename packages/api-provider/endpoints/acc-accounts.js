import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { AccAccountsEndpoints } from '@/api/acc-accounts.js';

export default createClientProxy(AccAccountsEndpoints, authApi);
export const AccAccountsEndpointsProxy = createClientProxy(AccAccountsEndpoints, authApi);
