import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { HrLeaveRequestsEndpoints } from '@/api/hr-leave-requests.js';

export default createClientProxy(HrLeaveRequestsEndpoints, authApi);
export const HrLeaveRequestsEndpointsProxy = createClientProxy(HrLeaveRequestsEndpoints, authApi);
