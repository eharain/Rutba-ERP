import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { SocialRepliesEndpoints } from '@/api/social-replies.js';

export default createClientProxy(SocialRepliesEndpoints, authApi);
export const SocialRepliesEndpointsProxy = createClientProxy(SocialRepliesEndpoints, authApi);
