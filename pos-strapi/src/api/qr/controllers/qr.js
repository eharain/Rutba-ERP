'use strict';

/**
 * qr controller
 *
 * Public read-only lookup behind the storefront's /qr/<code> landing route.
 * Everything it returns is already published storefront data, so unlike the
 * other public endpoints it carries no requireApp guard — the in-store
 * scanner apps resolve the same codes.
 */

module.exports = {
  async resolve(ctx) {
    const code = ctx.params?.code ?? ctx.query?.code;
    if (!code) return ctx.badRequest('code is required');

    const matches = await strapi.service('api::qr.qr').resolve(code);

    return ctx.send({
      data: { code: String(code).trim(), matches },
      meta: { count: matches.length },
    });
  },
};
