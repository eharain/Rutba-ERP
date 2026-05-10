import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { HrDepartmentsEndpoints } from '@/api/hr-departments.js';

export default createClientProxy(HrDepartmentsEndpoints, authApi);
export const HrDepartmentsEndpointsProxy = createClientProxy(HrDepartmentsEndpoints, authApi);
