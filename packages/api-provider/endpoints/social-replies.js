import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { SocialRepliesEndpoints as SocialRepliesEndpointsApi } from '../api/social-replies.js';

const endpoints = createClientProxy(SocialRepliesEndpointsApi, authApi);

export default endpoints;
export const SocialRepliesEndpoints = endpoints;

