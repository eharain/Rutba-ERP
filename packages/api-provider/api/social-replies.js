export const SocialRepliesEndpoints = {
    list: (params = {}) => ({ path: '/social-replies', params }),
    del: (documentId) => ({ path: `/social-replies/${documentId}`, action: 'delete', method: 'delete' }),

};