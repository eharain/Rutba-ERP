import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { AccInvoicesEndpoints } from '@/api/acc-invoices.js';

export default createClientProxy(AccInvoicesEndpoints, authApi);
export const AccInvoicesEndpointsProxy = createClientProxy(AccInvoicesEndpoints, authApi);
