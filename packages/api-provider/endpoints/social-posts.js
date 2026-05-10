import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { SocialPostsEndpoints } from '@/api/social-posts.js';

export default createClientProxy(SocialPostsEndpoints, authApi);
export const SocialPostsEndpointsProxy = createClientProxy(SocialPostsEndpoints, authApi);
