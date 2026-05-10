export const SocialPostsEndpoints = {
    list: (params = {}) => ({ path: '/social-posts', params }),
    byId: (documentId, params = {}) => ({ path: `/social-posts/${documentId}`, params }),
    create: () => ({ path: '/social-posts' }),
    update: (documentId) => ({ path: `/social-posts/${documentId}` }),
    publish: (documentId) => ({ path: `/social-posts/${documentId}/publish` }),
    unpublish: (documentId) => ({ path: `/social-posts/${documentId}/unpublish` }),
    replies: (documentId) => ({ path: `/social-posts/${documentId}/replies` }),

    fetchList: (params = {}) => authApi.fetch('/social-posts', params),
    fetchById: (documentId, params = {}) => authApi.fetch(`/social-posts/${documentId}`, params),
    fetchPublishedMarker: () => authApi.get('/social-posts', { status: 'published', fields: ['documentId'], pagination: { pageSize: 200 } }),
    postCreate: (data) => authApi.post('/social-posts', data),
    putUpdate: (documentId, data) => authApi.put(`/social-posts/${documentId}`, data),
    putUpdateDraft: (documentId, data) => authApi.put(`/social-posts/${documentId}?status=draft`, data),
    postPublish: (documentId) => authApi.post(`/social-posts/${documentId}/publish`, {}),
    postUnpublish: (documentId) => authApi.post(`/social-posts/${documentId}/unpublish`, {}),
    del: (documentId) => authApi.del(`/social-posts/${documentId}`),
};