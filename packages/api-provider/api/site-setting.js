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
        // 'social' reads site_logo to brand the videos the Video Studio renders.
        // 'admin' administers the rows themselves — the admin app's
        // /site-settings list + editor. Without it here the admin app 403s on
        // every site-setting call, which is why it could not read them at all.
        domains: ['console', 'cms', 'orders', 'social', 'storefront', 'portal'],
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

    // The server resolves WHICH row from the query string (?app=) or the
    // X-Rutba-App header — see appSlugFrom() in the site-setting controller —
    // so the slug has to travel as a param. Sent as a body it is ignored and
    // the call silently acts on the caller's own app row, or the default.
    publishResolved: ({ app } = {}) => ({
        path: '/site-setting/publish', action: 'publish', method: 'post',
        params: app ? { app } : {},
    }),
    unpublishResolved: ({ app } = {}) => ({
        path: '/site-setting/unpublish', action: 'unpublish', method: 'post',
        params: app ? { app } : {},
    }),
    discardResolved: ({ app } = {}) => ({
        path: '/site-setting/discard', action: 'discard', method: 'post',
        params: app ? { app } : {},
    }),

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

    // Per-row create / updateDraft / delete, on the same shape every other CMS
    // collection uses — so the row editor behaves like the pages / footers
    // editors beside it.
    ...__publish_generic_helper('site-settings'),

    // ...except publish/unpublish, which the helper puts on
    // /site-settings/:id/publish — a route NEITHER server has. services/strapi
    // routes publish at the singular /site-setting/publish and picks the row by
    // app slug (routes/01-custom-site-setting.js), and core mirrors it; the
    // per-row form was a deliberate omission, not an oversight, because the
    // resolver owns "which row is live for this app".
    //
    // Overriding AFTER the spread so the helper's broken pair never escapes.
    // Takes the row's app_slug, not its documentId: pass the slug of the row
    // being edited and the resolver lands on that row (a row with no slug is
    // the default row, which is also where an omitted slug resolves).
    publish: (appSlug) => ({
        path: '/site-setting/publish', action: 'publish', method: 'post',
        params: appSlug ? { app: appSlug } : {},
    }),
    unpublish: (appSlug) => ({
        path: '/site-setting/unpublish', action: 'unpublish', method: 'post',
        params: appSlug ? { app: appSlug } : {},
    }),
};
