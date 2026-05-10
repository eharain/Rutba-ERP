import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { PaySalaryStructuresEndpoints } from '@/api/pay-salary-structures.js';

export default createClientProxy(PaySalaryStructuresEndpoints, authApi);
export const PaySalaryStructuresEndpointsProxy = createClientProxy(PaySalaryStructuresEndpoints, authApi);
