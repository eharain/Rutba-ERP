import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { CustomersEndpoints } from '@/api/customers.js';

export default createClientProxy(CustomersEndpoints, authApi);
export const CustomersEndpointsProxy = createClientProxy(CustomersEndpoints, authApi);
