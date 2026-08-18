'use strict';

/**
 * Carry site_settings.app_slug across the web → storefront rename (P3).
 *
 * Migration 022 renamed the app KEYS — api_pro_app_domains.key and
 * api_pro_app_roles.key — but `web` is also an app IDENTITY, and the identity
 * travels on the wire as the `X-Rutba-App` header. Two subsystems read that
 * header, and 022 only moved one of them:
 *
 *   api_pro_app_domains.key   matched for authorization   (renamed in 022)
 *   site_settings.app_slug    matched for branding        (this migration)
 *
 * site_settings is a collection keyed by app_slug; the server resolves "which
 * row" from the same header (see packages/shared/hooks/useSiteLogo.js), and an
 * app with no row of its own falls back to the row flagged is_default. So the
 * storefront would not have failed loudly here — it would have quietly started
 * rendering the default instance branding, along with the default tracking ids,
 * which is exactly the failure the console's own site-settings editor warns
 * about ("this is the usual reason someone concludes tracking is broken").
 *
 * Paired with `WEB_CTX = { appName: 'storefront' }` in packages/api-provider/
 * lib/api.js and the `requireApp(ctx, 'storefront')` guards. All three halves —
 * the header the client sends, the domain authorization matches, and the slug
 * branding matches — must move in the same release.
 *
 * Only a row that is literally 'web' is touched, so this is a no-op on an
 * instance that never had one.
 */

const TABLE = 'site_settings';
const FROM = 'web';
const TO = 'storefront';

module.exports = {
  async up(knex) {
    if (!(await knex.schema.hasTable(TABLE))) return;

    // A 'storefront' row already existing would make this ambiguous: two rows
    // would then claim the same slug and the resolver would pick arbitrarily.
    // Leave it alone and say so rather than merge two rows automatically.
    const existing = await knex(TABLE).where({ app_slug: TO }).first('id');
    if (existing) {
      console.log(
        `[023] ${TABLE}.app_slug='${TO}' already exists (id ${existing.id}) — leaving '${FROM}' rows untouched.`
      );
      return;
    }

    const renamed = await knex(TABLE).where({ app_slug: FROM }).update({ app_slug: TO });
    console.log(`[023] ${TABLE}.app_slug '${FROM}' → '${TO}': ${renamed} row(s)`);
  },

  async down(knex) {
    if (!(await knex.schema.hasTable(TABLE))) return;
    const reverted = await knex(TABLE).where({ app_slug: TO }).update({ app_slug: FROM });
    console.log(`[023] reverted ${reverted} row(s)`);
  },
};
