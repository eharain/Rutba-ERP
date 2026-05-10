import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { SocialAccountsEndpoints } from '@/api/social-accounts.js';

export default createClientProxy(SocialAccountsEndpoints, authApi);
export const SocialAccountsEndpointsProxy = createClientProxy(SocialAccountsEndpoints, authApi);
