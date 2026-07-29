'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

const UID = 'api::site-setting.site-setting';

/**
 * Site Settings resolution.
 *
 * Site settings used to be a singleType — one row, everybody shared it. It is
 * now a collection with one row per app, so every read has to answer "which
 * row?". That question is answered in exactly one place, here, so the
 * storefront, the CMS and any future app can't drift apart on the rule:
 *
 *   1. the row whose `app_slug` matches the requesting app
 *   2. otherwise the row flagged `is_default`
 *   3. otherwise the first row that exists
 *
 * Step 3 keeps a fresh install working before anyone has flagged a default,
 * and step 2 is what makes an unkeyed request (the storefront's plain
 * `GET /site-setting`) behave exactly as it did when this was a singleton.
 */
module.exports = createCoreService(UID, ({ strapi }) => ({
  /**
   * Resolve the site-setting row for an app.
   *
   * @param {string|null} appSlug  app key, e.g. 'web' | 'pos' | 'cms'
   * @param {object} opts          { populate, fields, status }
   * @returns the document, or null when the collection is empty
   */
  async resolve(appSlug = null, opts = {}) {
    const { status, ...rest } = opts;

    // Prefer the published row (what a storefront should show) but fall back
    // to the draft so a freshly-created row never hard-404s a public client.
    const statuses = status ? [status] : ['published', 'draft'];

    const attempts = [];
    if (appSlug) attempts.push({ app_slug: appSlug });
    attempts.push({ is_default: true });
    attempts.push(null); // any row

    for (const filters of attempts) {
      for (const st of statuses) {
        const doc = await strapi.documents(UID).findFirst({
          ...rest,
          status: st,
          ...(filters ? { filters } : {}),
        }).catch(() => null);
        if (doc) return doc;
      }
    }

    return null;
  },

  /**
   * Ensure at most one row carries `is_default`. Called from the lifecycles
   * after a row is written with the flag set.
   */
  async clearOtherDefaults(keepId) {
    if (!keepId) return;
    await strapi.db.query(UID).updateMany({
      where: { is_default: true, id: { $ne: keepId } },
      data: { is_default: false },
    });
  },
}));
