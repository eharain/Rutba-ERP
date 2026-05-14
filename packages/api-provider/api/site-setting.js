import { byIdParams } from './__param_builders.js';

export const SiteSettingEndpoints = {
    meta: { domains: ['cms', 'order-management', 'web'] },

    getDraft: ({ populate, fields } = {}) => ({
        path: '/site-setting',
        params: byIdParams({ populate, fields }, { populate: ['site_logo'] }, { status: 'draft' }),
    }),

    fetchDraft: ({ populate, fields } = {}) => ({
        path: '/site-setting',
        params: byIdParams({ populate, fields }, { populate: ['site_logo'] }, { status: 'draft' }),
    }),

    getPublished: ({ populate, fields } = {}) => ({
        path: '/site-setting',
        params: byIdParams({ populate, fields }, {}, { status: 'published' }),
    }),

    updateDraft: (data) => ({ path: '/site-setting', action: 'updateDraft', method: 'put', data }),
    publish: (data) => ({ path: '/site-setting/publish', action: 'publish', method: 'post', data }),
    discard: (data) => ({ path: '/site-setting/discard', action: 'discard', method: 'post', data }),
};

