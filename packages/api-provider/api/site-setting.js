import __publish_generic_helper from './__publish_generic_helper.js';
import { byIdParams } from './__param_builders.js';

/**
 * Site settings are a COLLECTION (one row per app), resolved by `app_slug` and
 * falling back to the row flagged `is_default`.
 *
 * Two families of endpoint live here, deliberately named apart so neither
 * shadows the other:
 *
 *   - RESOLVER (`/site-setting`, singular) — "the settings for this app". This
 *     is what every consuming app wants and what the singleType used to serve,
 *     so these signatures are unchanged and nothing broke when the type
 *     flipped. `*Resolved` methods act on whichever row resolves.
 *   - COLLECTION (`/site-settings`, plural) — the CMS list and per-row editor,
 *     which address a specific row by documentId.
 */
export const SiteSettingEndpoints = {
    meta: {
        uid: 'api::site-setting.site-setting',
        domains: ['cms', 'order-management', 'web', 'web-user'],
        roles: ['admin', 'manager', 'staff', 'public', 'user'],
    },

    // ── Resolver: the requesting app's row, else the default ──────────────
    getDraft: ({ populate, fields, app } = {}) => ({
        path: '/site-setting',
        params: byIdParams({ populate, fields }, { populate: ['site_logo'] }, { status: 'draft', ...(app ? { app } : {}) }),
    }),

    fetchDraft: ({ populate, fields, app } = {}) => ({
        path: '/site-setting',
        params: byIdParams({ populate, fields }, { populate: ['site_logo'] }, { status: 'draft', ...(app ? { app } : {}) }),
    }),

    getPublished: ({ populate, fields, app } = {}) => ({
        path: '/site-setting',
        params: byIdParams({ populate, fields }, {}, { status: 'published', ...(app ? { app } : {}) }),
    }),

    // Reads only — writing to "whichever row resolves" is ambiguous, and the
    // resolver path is unauthenticated. Editing goes through the collection
    // methods below, which address a specific row.
    publishResolved: (data) => ({ path: '/site-setting/publish', action: 'publish', method: 'post', data }),
    discardResolved: (data) => ({ path: '/site-setting/discard', action: 'discard', method: 'post', data }),

    // ── Collection: every app's row, for the CMS list + row editor ────────
    list: ({ populate, fields, sort, pagination } = {}) => ({
        path: '/site-settings',
        method: 'get',
        params: {
            ...(populate ? { populate } : { populate: ['site_logo'] }),
            ...(fields ? { fields } : {}),
            ...(sort ? { sort } : { sort: ['is_default:desc', 'app_slug:asc'] }),
            ...(pagination ? { pagination } : {}),
            status: 'draft',
        },
    }),

    findOne: (documentId, { populate, fields, status } = {}) => ({
        path: `/site-settings/${documentId}`,
        method: 'get',
        params: {
            ...(populate ? { populate } : { populate: ['site_logo', 'favicon', 'default_og_image', 'default_footer'] }),
            ...(fields ? { fields } : {}),
            status: status || 'draft',
        },
    }),

    // Per-row create / updateDraft / publish / unpublish / delete, on the same
    // shape every other CMS collection uses — so the row editor behaves exactly
    // like the pages / footers editors beside it.
    ...__publish_generic_helper('site-settings'),
};
