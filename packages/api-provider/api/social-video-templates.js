import { listParams } from './__param_builders.js';

/**
 * SocialVideoTemplatesEndpoints
 *
 * Named looks for generated social videos: each row is a layer stack plus
 * renderer options for @rutba/video-maker. The Video Studio lets users pick
 * and save them; the Social Poster resolves a post's `video_settings` (or the
 * `is_default` row) so an unattended render produces exactly the picture the
 * studio previewed. That parity is the whole point of storing these
 * server-side rather than in each app.
 */
export const SocialVideoTemplatesEndpoints = {
    meta: {
        uid: 'api::social-video-template.social-video-template',
        domains: ['social'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/social-video-templates',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['is_default:desc', 'name:asc'], populate: ['preview_image'], pageSize: 100 },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/social-video-templates/${documentId}`,
        params: { ...(populate ? { populate } : { populate: ['preview_image'] }), ...(fields ? { fields } : {}) },
    }),

    create: (data) => ({ path: '/social-video-templates', action: 'create', method: 'post', data }),
    update: (documentId, data) => ({ path: `/social-video-templates/${documentId}`, action: 'update', method: 'put', data }),
    del: (documentId) => ({ path: `/social-video-templates/${documentId}`, action: 'delete', method: 'delete' }),
};
