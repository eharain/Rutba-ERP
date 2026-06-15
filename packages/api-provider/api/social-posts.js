import __publish_generic_helper from "./__publish_generic_helper.js";

export const SocialPostsEndpoints = {
    meta: { domains: ['social'] },

    // todo: spread adds updateDraft/publish/unpublish/create/del. Inline
    // create/update/publish/unpublish below override the helper versions —
    // the helper's contribution here is effectively just `updateDraft` + `del`.
    ...__publish_generic_helper('social-posts'),
    list: (params = {}) => ({ path: '/social-posts', params }),
    byId: (documentId, params = {}) => ({ path: `/social-posts/${documentId}`, params }),
    create: (data) => ({ path: '/social-posts' , data }),
    update: (documentId, data) => ({ path: `/social-posts/${documentId}` , data }),
    publish: (documentId) => ({ path: `/social-posts/${documentId}/publish` }),
    unpublish: (documentId) => ({ path: `/social-posts/${documentId}/unpublish` }),
    replies: (documentId) => ({ path: `/social-posts/${documentId}/replies` }),

    // ── two-way provider integration ──
    // publishSocial actually pushes the post to the connected platforms and
    // populates platform_results (distinct from `publish`, which only flips the
    // Strapi draft/published flag).
    publishSocial: (documentId) => ({ path: `/social-posts/${documentId}/publish-social`, action: 'publishSocial', method: 'post' }),
    unpublishSocial: (documentId) => ({ path: `/social-posts/${documentId}/unpublish-social`, action: 'unpublishSocial', method: 'post' }),
    syncReplies: (documentId) => ({ path: `/social-posts/${documentId}/sync-replies`, action: 'syncReplies', method: 'post' }),
    sendReply: (documentId, data) => ({ path: `/social-posts/${documentId}/reply`, action: 'sendReply', method: 'post', data }),
    // todo: speculative stub — rutba-social/pages/posts/index.js uses this to mark
    // which drafts have a published counterpart. The current implementation returns
    // documentId-only list of published rows; verify the Strapi status filter is
    // applied correctly under the social-posts content type's draft-publish config.
    publishedMarker: () => ({
        path: '/social-posts',
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize: 500 },
        },
    }),

};