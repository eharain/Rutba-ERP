import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { HrEmployeesEndpoints } from '@/api/hr-employees.js';

export default createClientProxy(HrEmployeesEndpoints, authApi);
export const HrEmployeesEndpointsProxy = createClientProxy(HrEmployeesEndpoints, authApi);
