import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { SocialPostsEndpoints as SocialPostsEndpointsApi } from '../api/social-posts.js';

const endpoints = createClientProxy(SocialPostsEndpointsApi, authApi);

export default endpoints;
export const SocialPostsEndpoints = endpoints;

