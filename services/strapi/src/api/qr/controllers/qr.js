'use strict';

/**
 * qr controller
 *
 * Public read-only lookup behind the storefront's /qr/<code> landing route and
 * its /s/<code> short links. Everything it returns is already published
 * storefront data, so unlike the other public endpoints it carries no
 * requireApp guard — the in-store scanner apps resolve the same codes.
 *
 * `?prefer=short` is a query flag rather than a second route on purpose: the
 * route is `auth: false` and both backends register it by hand (services/strapi
 * routes/qr.js, services/core src/modules/catalog.js), so a new path would mean a
 * new api-pro action to seed and a koa-router ordering hazard against the
 * existing `/qr/resolve/:code`. A flag on the route that already works costs
 * neither.
 */

module.exports = {
  async resolve(ctx) {
    const code = ctx.params?.code ?? ctx.query?.code;
    if (!code) return ctx.badRequest('code is required');

    // `/s/<code>` sets this. It changes ranking only — see the service's
    // `preferShortCode` note for why the two namespaces must differ.
    const preferShortCode = String(ctx.query?.prefer ?? '') === 'short';

    const matches = await strapi.service('api::qr.qr').resolve(code, { preferShortCode });

    return ctx.send({
      data: { code: String(code).trim(), matches },
      meta: { count: matches.length },
    });
  },
};
