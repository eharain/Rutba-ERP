'use strict';

// Delivery-state surface: the public MTA webhook + the manual report refresh.
//
// processWebhook is `auth: false` BY DESIGN and takes no requireAppRole: the
// caller is Rutba-MTA, not a user, and the HMAC over the exact raw bytes
// (X-Mailer-Signature, verified in the service with timingSafeEqual against
// each stored webhook_secret) IS the authentication. Idempotent — the MTA
// retries 6×; duplicate dedup_keys are acknowledged, not re-applied.

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');
const { PIXEL_GIF } = require('../../../utils/cmp-tracking');

const UID = 'api::cmp-run.cmp-run';

function fail(ctx, e) {
  const status = e?.status || 502;
  return ctx.send({ error: e?.code || 'error', message: e?.message || 'Request failed.' }, status);
}

module.exports = createCoreController(UID, ({ strapi }) => ({

  /** POST /cmp/webhook — MTA delivery events (sent/bounced/complained/...). */
  async processWebhook(ctx) {
    const raw = ctx.request.body?.[Symbol.for('unparsedBody')]
      ?? JSON.stringify(ctx.request.body || {});
    const signature = ctx.request.headers['x-mailer-signature'] || '';
    try {
      const result = await strapi.service(UID).ingestWebhook(raw, signature, ctx.request.body);
      if (!result.ok && result.status === 401) {
        return ctx.send({ error: result.error }, 401);
      }
      return ctx.send(result);
    } catch (e) {
      return fail(ctx, e);
    }
  },

  /**
   * GET /cmp/t/o/:token — the open pixel. ALWAYS answers with the 1×1 GIF,
   * valid token or not: a tracking failure must never surface as a broken
   * image in someone's inbox. Recording is best-effort.
   */
  async trackOpen(ctx) {
    try {
      await strapi.service(UID).recordTrackEvent('opened', ctx.params.token);
    } catch (e) {
      strapi.log.warn(`cmp track-open failed: ${e.message}`);
    }
    ctx.set('Content-Type', 'image/gif');
    ctx.set('Cache-Control', 'no-store, no-cache, max-age=0');
    ctx.body = PIXEL_GIF;
  },

  /**
   * GET /cmp/t/c/:token/:link — the click redirect. The destination comes
   * from the run's stored tracked_links by index (never from the request), so
   * a bad token or index is a 404, not an open redirect.
   */
  async trackClick(ctx) {
    try {
      const result = await strapi.service(UID).recordTrackEvent('clicked', ctx.params.token, ctx.params.link);
      if (result.ok && result.url) return ctx.redirect(result.url);
      return ctx.send({ error: result.error || 'not_found' }, result.status || 404);
    } catch (e) {
      return fail(ctx, e);
    }
  },

  /** POST /cmp-runs/:documentId/sync — pull the batch report on demand. */
  async syncRun(ctx) {
    const user = await requireAppRole(ctx, strapi, {
      domains: ['campaigns'],
      levels: ['admin', 'manager', 'staff'],
    });
    if (!user) return;
    try {
      return ctx.send(await strapi.service(UID).syncFromMta(ctx.params.documentId));
    } catch (e) {
      return fail(ctx, e);
    }
  },
}));
