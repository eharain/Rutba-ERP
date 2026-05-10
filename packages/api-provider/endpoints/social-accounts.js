import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { SocialAccountsEndpoints as SocialAccountsEndpointsApi } from '../api/social-accounts.js';

const endpoints = createClientProxy(SocialAccountsEndpointsApi, authApi);

export default endpoints;
export const SocialAccountsEndpoints = endpoints;

