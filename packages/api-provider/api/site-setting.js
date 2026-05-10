export const SiteSettingEndpoints = {
    getDraft: ({ populate } = {}) => ({
        path: '/site-setting',
        params: {
            status: 'draft',
            populate: populate ?? ['site_logo'],
        },
    }),

    getPublished: ({ fields } = {}) => ({
        path: '/site-setting',
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
        },
    }),

    updateDraft: () => ({ path: '/site-setting' }),
    publish: () => ({ path: '/site-setting/publish' }),
    discard: () => ({ path: '/site-setting/discard' }),

    fetchDraft: (opts = {}) => {
        const ep = SiteSettingEndpoints.getDraft(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    fetchPublished: (opts = {}) => {
        const ep = SiteSettingEndpoints.getPublished(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    putUpdateDraft: (data) => authApi.put('/site-setting', data, { status: 'draft' }),
    putUpdate: (data) => authApi.put('/site-setting', data),
    postPublish: () => authApi.post('/site-setting/publish', {}),
    postDiscard: () => authApi.post('/site-setting/discard', {}),
};