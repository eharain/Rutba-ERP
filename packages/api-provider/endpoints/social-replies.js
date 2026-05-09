import { authApi } from '../lib/api.js';

export const SocialRepliesEndpoints = {
    list: (params = {}) => ({ path: '/social-replies', params }),
    del: (documentId) => ({ path: `/social-replies/${documentId}` }),

    fetchList: (params = {}) => authApi.fetch('/social-replies', params),
    putDelete: (documentId) => authApi.del(`/social-replies/${documentId}`),
};
