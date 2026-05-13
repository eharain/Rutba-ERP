export const SiteSettingEndpoints = {
    getDraft: ({ populate } = {}) => ({
        path: '/site-setting',
        params: {
            status: 'draft',
            populate: populate ?? ['site_logo'],
        },
    }),

    fetchDraft: ({ populate } = {}) => ({
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

    updateDraft: (data) => ({ path: '/site-setting', action: 'updateDraft', method: 'put', data }),
    publish: (data) => ({ path: '/site-setting/publish', action: 'publish', method: 'post', data }),
    discard: (data) => ({ path: '/site-setting/discard', action: 'discard', method: 'post', data }),
};

