export const SocialPostsEndpoints = {
    list: (params = {}) => ({ path: '/social-posts', params }),
    byId: (documentId, params = {}) => ({ path: `/social-posts/${documentId}`, params }),
    create: (data) => ({ path: '/social-posts' , data }),
    update: (documentId, data) => ({ path: `/social-posts/${documentId}` , data }),
    publish: (documentId) => ({ path: `/social-posts/${documentId}/publish` }),
    unpublish: (documentId) => ({ path: `/social-posts/${documentId}/unpublish` }),
    replies: (documentId) => ({ path: `/social-posts/${documentId}/replies` }),

};