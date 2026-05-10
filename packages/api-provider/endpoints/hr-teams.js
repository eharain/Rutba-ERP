import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { HrTeamsEndpoints } from '@/api/hr-teams.js';

export default createClientProxy(HrTeamsEndpoints, authApi);
export const HrTeamsEndpointsProxy = createClientProxy(HrTeamsEndpoints, authApi);
