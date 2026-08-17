'use strict';

// Sending identities hold the MTA trust token, so every mutation here is
// admin-only via requireAppAdmin — a DB-backed check, not the X-Rutba-App-Role
// header (which is claim selection, not proof of membership). find/findOne stay
// on the core controller for the settings list; `private: true` strips the
// secrets on serialize.
//
// Handler names are constrained: the api-pro seeder only walks descriptor keys
// matching its prefix whitelist (list|by|get|…|set|validate|reset|…), and the
// descriptor `action` must equal the handler name. So the natural names —
// bootstrap / verify / rotateToken / mtaHealth — would each be skipped by the
// seeder and answer 403 forever. setupSender / validateSender / resetToken /
// getMtaHealth are the whitelisted equivalents.

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppAdmin } = require('../../../utils/require-admin');
const mta = require('../../../utils/mta-client');

const UID = 'api::cmp-sending-identity.cmp-sending-identity';

/** Map a thrown service/MTA error onto a ctx response. */
function fail(ctx, e) {
  const status = e?.status || 502;
  return ctx.send({ error: e?.code || 'error', message: e?.message || 'Request failed.' }, status);
}

module.exports = createCoreController(UID, ({ strapi }) => ({

  /**
   * POST /cmp-sending-identities/:documentId/setup
   * Register with the MTA and store the once-only credentials.
   * Body: { smtp: { host, port, secure, username, password }, webhookUrl? }
   */
  async setupSender(ctx) {
    if (!(await requireAppAdmin(ctx, strapi, 'campaigns'))) return;
    const { smtp, webhookUrl } = ctx.request.body || {};
    try {
      const identity = await strapi.service(UID).bootstrap(ctx.params.documentId, { smtp, webhookUrl });
      return ctx.send({ ok: true, identity });
    } catch (e) {
      return fail(ctx, e);
    }
  },

  /**
   * POST /cmp-sending-identities/:documentId/validate
   * Confirm the stored token still authenticates. Never throws on an MTA
   * outage — returns { ok: false, error } so the settings screen can show it.
   */
  async validateSender(ctx) {
    if (!(await requireAppAdmin(ctx, strapi, 'campaigns'))) return;
    try {
      return ctx.send(await strapi.service(UID).verify(ctx.params.documentId));
    } catch (e) {
      return fail(ctx, e);
    }
  },

  /**
   * POST /cmp-sending-identities/:documentId/reset-token
   * Invalidates the old token at the MTA immediately.
   */
  async resetToken(ctx) {
    if (!(await requireAppAdmin(ctx, strapi, 'campaigns'))) return;
    try {
      return ctx.send(await strapi.service(UID).rotate(ctx.params.documentId));
    } catch (e) {
      return fail(ctx, e);
    }
  },

  /**
   * GET /cmp-sending-identities/mta-health
   * Is the MTA configured and reachable at all? Used by the settings screen
   * before an operator tries to register a sender.
   */
  async getMtaHealth(ctx) {
    if (!(await requireAppAdmin(ctx, strapi, 'campaigns'))) return;
    if (!mta.isConfigured()) {
      return ctx.send({ configured: false, reachable: false, message: 'MTA_BASE_URL is not set.' });
    }
    const identity = await strapi.service(UID).resolveDefault();
    if (!identity) {
      return ctx.send({
        configured: true,
        reachable: null,
        baseUrl: mta.baseUrl(),
        message: 'No sending identity yet.',
      });
    }
    const result = await strapi.service(UID).verify(identity.documentId);
    return ctx.send({
      configured: true,
      reachable: result.ok,
      baseUrl: mta.baseUrl(),
      identity: identity.name,
      ...(result.ok ? {} : { message: result.error }),
    });
  },
}));
