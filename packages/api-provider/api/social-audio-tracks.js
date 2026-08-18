import { listParams } from './__param_builders.js';

/**
 * SocialAudioTracksEndpoints
 *
 * The music library behind generated social videos. A track is EITHER a foreign
 * URL (a CDN, a royalty-free library) or a file uploaded to the media server —
 * and `url` is playable in both cases, so nothing downstream has to branch on
 * which. `audio_file` is set only for uploads, and is what tells the two apart
 * when one needs deleting.
 *
 * Read by the Video Studio in apps/content/social and by the Rutba Social Poster
 * desktop app, which draws a random active track when it renders a video
 * unattended.
 */
export const SocialAudioTracksEndpoints = {
    meta: {
        uid: 'api::social-audio-track.social-audio-track',
        domains: ['social'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/social-audio-tracks',
        params: listParams({ page, pageSize, sort, populate, filters, fields }),
    }),

    // Only the tracks a render may actually use. Kept here rather than spelled
    // out at each call site so the Studio and the poster cannot drift on what
    // "usable" means.
    active: ({ sort } = {}) => ({
        path: '/social-audio-tracks',
        params: {
            filters: { is_active: { $eq: true } },
            sort: sort || ['name:asc'],
            populate: ['audio_file'],
            pagination: { pageSize: 200 },
        },
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/social-audio-tracks/${documentId}`,
        params: { ...(populate ? { populate } : { populate: ['audio_file'] }), ...(fields ? { fields } : {}) },
    }),

    create: (data) => ({ path: '/social-audio-tracks', action: 'create', method: 'post', data }),
    update: (documentId, data) => ({ path: `/social-audio-tracks/${documentId}`, action: 'update', method: 'put', data }),
    del: (documentId) => ({ path: `/social-audio-tracks/${documentId}`, action: 'delete', method: 'delete' }),
};
